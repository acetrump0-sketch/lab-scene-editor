const root=new URL('../',import.meta.url);
export async function resolve(specifier,context,next){if(specifier==='three')return {url:new URL('v16/vendor/three.module.js',root).href,shortCircuit:true};return next(specifier,context);}
export async function load(url,context,next){if(url.startsWith(root.href)&&new URL(url).pathname.endsWith('.js'))return next(url,{...context,format:'module'});return next(url,context);}
