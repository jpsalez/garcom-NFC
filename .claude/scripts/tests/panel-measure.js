(async()=>{
 const resources=()=>performance.getEntriesByType('resource');
 const count=()=>resources().filter(r=>r.name.includes('/api/quality/scan')||r.name.includes('/api/script/')).length;
 const before=count();await new Promise(r=>setTimeout(r,3000));
 const r=resources(),main=document.querySelector('#main'),nav=document.querySelector('.hp-nav');
 const result={quality_or_script_requests_idle:count()-before,js_bytes:r.filter(x=>/\.js(?:\?|$)/.test(x.name)).reduce((n,x)=>n+x.encodedBodySize,0),css_bytes:r.filter(x=>/\.css(?:\?|$)/.test(x.name)).reduce((n,x)=>n+x.encodedBodySize,0),horizontal_page_overflow:main.scrollWidth>main.clientWidth+2,quality_scan_ms:r.filter(x=>x.name.includes('/api/quality/scan')).map(x=>Math.round(x.duration))};
 if(nav&&getComputedStyle(nav).flexDirection!=='row')throw Error('Abas da Saúde devem ser horizontais');
 if(result.quality_or_script_requests_idle)throw Error('Checagem executada automaticamente durante ociosidade');
 return result;
})()
