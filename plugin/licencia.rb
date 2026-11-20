# encoding: UTF-8
# AVICH 3D — cliente de licencia (activar, validar, desactivar, actualizar).
# Copiar a avich_3d/licencia.rb y cargarlo desde main.rb:  require_relative 'licencia'
# Habla con  POST <DOMINIO>/api/licencia  (ver functions/api/licencia.js).
require 'net/http'
require 'uri'
require 'json'
require 'securerandom'
require 'socket'

module Avich3D
  module Licencia
    # >>> CAMBIA SOLO ESTA LÍNEA por tu dominio definitivo (sin barra final), p. ej. 'https://grupoavich.com'
    DOMINIO = 'https://grupoavich.pages.dev'.freeze
    @url_api = DOMINIO + '/api/licencia'
    URL_CUENTA = (DOMINIO + '/mi-cuenta/').freeze
    SECCION = 'Avich3D_Licencia'.freeze
    GRACIA_SIN_CONEXION_DIAS = 7      # días que sigue funcionando sin poder validar
    INTERVALO_VALIDACION_HORAS = 12   # cada cuánto se vuelve a preguntar al servidor

    MENSAJES = {
      'clave_invalida'          => 'La clave no es válida. Revísala: tiene el formato AVICH-XXXX-XXXX-XXXX-XXXX.',
      'vencida'                 => "Tu licencia venció. Renuévala desde Mi cuenta: #{URL_CUENTA}",
      'pausada'                 => "Tu suscripción está pausada. Reactívala desde Mi cuenta: #{URL_CUENTA}",
      'revocada'                => 'Esta licencia fue desactivada. Escríbenos a grupoavich@gmail.com.',
      'limite_equipos'          => "Ya usaste todas las computadoras de tu plan. Quita una en Mi cuenta (#{URL_CUENTA}) y vuelve a intentar.",
      'equipo_no_registrado'    => 'Esta computadora no está activada. Actívala con tu clave.',
      'sin_clave'               => 'Todavía no activaste tu licencia.',
      'sin_conexion'            => 'No hay conexión con el servidor de licencias.',
      'sin_conexion_prolongada' => 'Hace varios días que no se puede validar tu licencia. Conéctate a internet.',
      'demasiados_intentos'     => 'Demasiados intentos seguidos. Espera unos minutos.'
    }.freeze

    class << self
      attr_accessor :url_api   # se puede cambiar en pruebas

      # ---------- almacenamiento local (registro de SketchUp; memoria fuera de SketchUp) ----------
      def leer(k, defecto = nil)
        return (@mem ||= {}).fetch(k, defecto) unless defined?(::Sketchup)
        ::Sketchup.read_default(SECCION, k, defecto)
      end

      def escribir(k, v)
        return ((@mem ||= {})[k] = v) unless defined?(::Sketchup)
        ::Sketchup.write_default(SECCION, k, v)
      end

      def clave;     leer('clave'); end
      def ultima_ok; leer('ultima_ok', 0).to_i; end

      def equipo_id
        id = leer('equipo_id')
        return id if id.is_a?(String) && id.length >= 8
        id = 'EQ-' + SecureRandom.hex(12)
        escribir('equipo_id', id)
        id
      end

      def nombre_equipo
        Socket.gethostname.to_s[0, 60]
      rescue StandardError
        'Equipo'
      end

      def mensaje(motivo)
        MENSAJES[motivo.to_s] || "No se pudo validar la licencia (#{motivo})."
      end

      # ---------- consulta rápida local (no usa internet) ----------
      # ¿Se puede trabajar ahora? Úsalo para habilitar o bloquear funciones.
      def vigente?
        return false if clave.to_s.empty?
        (Time.now.to_i - ultima_ok) < GRACIA_SIN_CONEXION_DIAS * 86_400
      end

      # ---------- acciones contra el servidor ----------
      def activar(clave_nueva)
        k = clave_nueva.to_s.strip.upcase
        r = llamar('activar', k)
        return fallo(r) unless r[:ok]
        escribir('clave', k)
        escribir('ultima_ok', Time.now.to_i)
        escribir('plan', "#{r[:datos]['plan']} #{r[:datos]['periodo']}")
        r[:datos].merge('ok' => true)
      end

      def validar(forzar = false)
        return { 'ok' => false, 'motivo' => 'sin_clave', 'mensaje' => mensaje('sin_clave') } if clave.to_s.empty?
        if !forzar && (Time.now.to_i - ultima_ok) < INTERVALO_VALIDACION_HORAS * 3600
          return { 'ok' => true, 'motivo' => 'reciente' }
        end
        r = llamar('validar', clave)
        if r[:red]
          return { 'ok' => true, 'motivo' => 'sin_conexion_tolerado' } if vigente?
          return { 'ok' => false, 'motivo' => 'sin_conexion_prolongada', 'mensaje' => mensaje('sin_conexion_prolongada') }
        end
        return r[:datos].merge('ok' => true).tap { escribir('ultima_ok', Time.now.to_i) } if r[:ok]
        escribir('ultima_ok', 0) # el servidor la rechazó: se bloquea
        fallo(r)
      end

      def desactivar
        return { 'ok' => true } if clave.to_s.empty?
        r = llamar('desactivar', clave)
        return fallo(r) unless r[:ok]
        escribir('clave', nil)
        escribir('ultima_ok', 0)
        { 'ok' => true }
      end

      # Devuelve { 'hay_nueva'=>true, 'version'=>'1.2.0', 'url'=>..., 'notas'=>... }
      def buscar_actualizacion(version_actual)
        r = llamar('version', clave, 'version' => version_actual.to_s)
        return fallo(r) unless r[:ok]
        r[:datos].merge('ok' => true)
      end

      # Baja el .rbz a `destino` (carpeta) y lo instala si estamos dentro de SketchUp.
      def descargar_e_instalar(url, destino = nil)
        require 'tmpdir'
        destino ||= Dir.tmpdir
        ruta = File.join(destino, 'avich_3d_actualizacion.rbz')
        uri = URI.parse(url)
        Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == 'https', open_timeout: 10, read_timeout: 120) do |http|
          http.request(Net::HTTP::Get.new(uri.request_uri)) do |resp|
            raise "Descarga fallida (#{resp.code})" unless resp.is_a?(Net::HTTPSuccess)
            File.open(ruta, 'wb') { |f| resp.read_body { |parte| f.write(parte) } }
          end
        end
        ::Sketchup.install_from_archive(ruta, true) if defined?(::Sketchup) && ::Sketchup.respond_to?(:install_from_archive)
        ruta
      end

      # Valida en un hilo para no congelar SketchUp; el bloque se ejecuta en el hilo principal.
      def validar_async(forzar = true, &bloque)
        resultado = nil
        Thread.new { resultado = validar(forzar) rescue { 'ok' => false, 'motivo' => 'sin_conexion' } }
        return resultado unless defined?(::UI) && bloque
        temporizador = nil
        temporizador = ::UI.start_timer(0.5, true) do
          if resultado
            ::UI.stop_timer(temporizador)
            bloque.call(resultado)
          end
        end
      end

      # ---------- diálogos sencillos (menú Extensiones > Avich 3D) ----------
      # Llamar desde un comando de menú, no desde dentro de una herramienta activa.
      def dialogo_activar
        entrada = ::UI.inputbox(['Clave de licencia'], [clave.to_s], 'Activar AVICH 3D')
        return unless entrada
        res = activar(entrada[0])
        if res['ok']
          ::UI.messagebox("¡Licencia activada!\nPlan: #{leer('plan')}\nEsta computadora: #{nombre_equipo}")
        else
          ::UI.messagebox(res['mensaje'])
        end
      end

      private

      def fallo(r)
        return { 'ok' => false, 'motivo' => 'sin_conexion', 'mensaje' => mensaje('sin_conexion') } if r[:red]
        m = r[:datos]['motivo'].to_s
        { 'ok' => false, 'motivo' => m, 'mensaje' => mensaje(m) }.merge(r[:datos].reject { |k, _| %w[ok motivo].include?(k) })
      end

      # -> { ok:, red:, datos: }   red:true = no hubo respuesta útil (red caída, 5xx, 429)
      def llamar(accion, clave_licencia, extra = {})
        uri = URI.parse(@url_api)
        http = Net::HTTP.new(uri.host, uri.port)
        http.use_ssl = (uri.scheme == 'https')
        http.open_timeout = 8
        http.read_timeout = 15
        req = Net::HTTP::Post.new(uri.request_uri, 'Content-Type' => 'application/json')
        req.body = JSON.generate({ 'accion' => accion, 'clave' => clave_licencia.to_s, 'equipo_id' => equipo_id,
                                   'equipo_nombre' => nombre_equipo }.merge(extra))
        resp = http.request(req)
        return { red: true } if resp.code.to_i >= 500 || resp.code.to_i == 429
        datos = JSON.parse(resp.body.to_s)
        { ok: datos['ok'] == true, datos: datos }
      rescue StandardError
        { red: true }
      end
    end
  end
end
