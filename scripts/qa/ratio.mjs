const h=s=>[1,3,5].map(i=>parseInt(s.slice(i,i+2),16));
const L=c=>{const[r,g,b]=c.map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4});return .2126*r+.7152*g+.0722*b};
export const ratio=(a,b)=>{const x=L(h(a)),y=L(h(b));return ((Math.max(x,y)+.05)/(Math.min(x,y)+.05)).toFixed(2)};
if(process.argv[2])console.log(ratio(process.argv[2],process.argv[3]));
