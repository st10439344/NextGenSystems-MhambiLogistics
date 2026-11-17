'use strict';
// Quoted prices exclude VAT. Demonstration assumes current project default VAT 15%.
const VAT_RATE = 0.15;
const round = n => Math.round((n + Number.EPSILON) * 100) / 100;
function calculateTotal(subtotal){
 if (!Number.isFinite(subtotal) || subtotal <= 0) throw new Error('Invalid subtotal');
 const s=round(subtotal),vat=round(s*VAT_RATE);
 return {subtotal:s,vat,total:round(s+vat)};
}
module.exports={calculateTotal,VAT_RATE};
