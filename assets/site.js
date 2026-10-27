(function(){
  var banner=document.getElementById('trialBanner');
  function setH(){document.documentElement.style.setProperty('--banner-h',banner?banner.offsetHeight+'px':'0px')}
  setH();window.addEventListener('resize',setH);
  if(document.fonts&&document.fonts.ready)document.fonts.ready.then(setH);

  var t=document.getElementById('navToggle'),l=document.getElementById('navLinks');
  var st=document.querySelector('.sub-toggle'),sub=document.getElementById('subExt');
  function closeSub(){if(st){sub.classList.remove('open');st.setAttribute('aria-expanded','false')}}
  function closeMenu(){l.classList.remove('open');t.setAttribute('aria-expanded','false');t.setAttribute('aria-label','Abrir menú');closeSub()}
  t.addEventListener('click',function(){
    var o=l.classList.toggle('open');
    t.setAttribute('aria-expanded',o);t.setAttribute('aria-label',o?'Cerrar menú':'Abrir menú');
  });
  if(st)st.addEventListener('click',function(e){
    e.stopPropagation();var o=sub.classList.toggle('open');st.setAttribute('aria-expanded',o);
  });
  l.addEventListener('click',function(e){if(e.target.closest('a'))closeMenu()});
  document.addEventListener('click',function(e){if(st&&!e.target.closest('.has-sub'))closeSub()});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')closeMenu()});
  window.addEventListener('resize',function(){if(window.innerWidth>640)closeMenu()});

  var tabs=[].slice.call(document.querySelectorAll('.tab-btn'));
  function activate(btn,focus){
    tabs.forEach(function(b){
      var on=b===btn;
      b.classList.toggle('active',on);b.setAttribute('aria-selected',on);b.tabIndex=on?0:-1;
      var p=document.getElementById('tab-'+b.dataset.tab);
      p.classList.toggle('active',on);p.hidden=!on;
    });
    if(focus)btn.focus();
  }
  tabs.forEach(function(b,i){
    b.addEventListener('click',function(){activate(b)});
    b.addEventListener('keydown',function(e){
      var n=null;
      if(e.key==='ArrowRight')n=tabs[(i+1)%tabs.length];
      else if(e.key==='ArrowLeft')n=tabs[(i-1+tabs.length)%tabs.length];
      else if(e.key==='Home')n=tabs[0];
      else if(e.key==='End')n=tabs[tabs.length-1];
      if(n){e.preventDefault();activate(n,true)}
    });
  });

  var plans=[].slice.call(document.querySelectorAll('.toggle-btn'));
  plans.forEach(function(b){
    b.addEventListener('click',function(){
      plans.forEach(function(x){var on=x===b;x.classList.toggle('active',on);x.setAttribute('aria-pressed',on)});
      document.querySelectorAll('.plan-section').forEach(function(p){p.classList.toggle('active',p.id==='plan-'+b.dataset.plan)});
    });
  });
})();
