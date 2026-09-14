/** Arithmetic over supplied specifications. No grading, stock check or appraisal. */
const number = (v: unknown, field: string, max: number): number | null => {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > max)
    throw new Error(`${field} must be a finite positive number no greater than ${max}.`);
  return v;
};
const round = (v: number) => {
  const result = Math.round(v * 100) / 100;
  if (!Number.isFinite(result)) throw new Error('Supplied values exceed the supported calculation range.');
  return result;
};
export function compareDiamonds(args: Record<string, unknown>): [unknown, boolean] {
  const stones = args.stones;
  if (!Array.isArray(stones) || stones.length < 2 || stones.length > 5)
    throw new Error('Supply between two and five stones.');
  const ids = new Set<string>();
  const rows = stones.map((stone: any) => {
    if (!stone || typeof stone !== 'object' || Array.isArray(stone)) throw new Error('Each stone must be an object.');
    if (typeof stone.label !== 'string' || !stone.label.trim() || stone.label.length > 80)
      throw new Error('Each stone needs a label of 1 to 80 characters.');
    const label = stone.label.trim();
    if (ids.has(label.toLowerCase())) throw new Error('Stone labels must be unique.');
    ids.add(label.toLowerCase());
    const carat = number(stone.carat,'carat',100);
    const length = number(stone.length_mm,'length_mm',100);
    const width = number(stone.width_mm,'width_mm',100);
    const price = number(stone.price,'price',100000000);
    const currency = stone.currency;
    if (currency != null && (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)))
      throw new Error('currency must be a three-letter uppercase currency code.');
    if (price !== null && !currency) throw new Error('A supplied price requires its currency.');
    if ((length === null) !== (width === null)) throw new Error('Supply both length_mm and width_mm, or omit both.');
    const missing = [carat === null && 'carat', length === null && 'measured_dimensions', price === null && 'price'].filter(Boolean);
    return {label,carat,length_mm:length,width_mm:width,price,currency:currency || null,
      length_to_width_ratio:length !== null && width !== null ? round(Math.max(length,width)/Math.min(length,width)) : null,
      price_per_carat:price !== null && carat !== null ? round(price/carat) : null,
      missing,verification:'user_supplied_unverified'};
  });
  const currencies = new Set(rows.filter(r=>r.price !== null).map(r=>r.currency));
  const comparable = rows.every(r=>r.price !== null) && currencies.size === 1;
  const baseline = rows[0];
  return [{stones:rows,price_comparison_available:comparable,
    baseline:baseline.label,
    differences:rows.slice(1).map(r=>({label:r.label,
      price_difference:comparable ? round(r.price!-baseline.price!) : null,
      carat_difference:r.carat !== null && baseline.carat !== null ? round(r.carat-baseline.carat) : null,
      length_difference_mm:r.length_mm !== null && baseline.length_mm !== null ? round(r.length_mm-baseline.length_mm) : null,
      width_difference_mm:r.width_mm !== null && baseline.width_mm !== null ? round(r.width_mm-baseline.width_mm) : null})),
    methodology:'Arithmetic from supplied specifications. Differences are each stone minus the first stone. Ratio uses longer dimension divided by shorter dimension. No currency conversion or missing-value estimates.',
    limitations:['Specifications and prices are not independently verified.','Lower price per carat does not establish better quality or value.','Dimensions and weight cannot establish brilliance, eye-clean appearance, or setting compatibility.','No overall winner is assigned.'],
    next_steps:['Verify each grading report with its issuing lab.','Compare actual stone videos and ask the jeweler about appearance and setting fit.','Confirm current availability and the complete ring price, including setting and applicable charges.']},false];
}
export const COMPARE_TOOL = {
  name:'compare_diamonds',title:'Compare supplied diamond specifications',
  description:'Compare two to five diamonds from any seller using supplied carat, measured millimeters and prices. Returns ratios, price per carat, differences and missing information. Never verifies specifications, ranks beauty, appraises value or declares a best diamond. Prices must use explicit currencies; mixed currencies are not compared.',
  annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  inputSchema:{type:'object',additionalProperties:false,required:['stones'],properties:{stones:{type:'array',minItems:2,maxItems:5,items:{type:'object',additionalProperties:false,required:['label'],properties:{
    label:{type:'string',minLength:1,maxLength:80},carat:{type:'number',exclusiveMinimum:0,maximum:100},
    length_mm:{type:'number',exclusiveMinimum:0,maximum:100},width_mm:{type:'number',exclusiveMinimum:0,maximum:100},
    price:{type:'number',exclusiveMinimum:0,maximum:100000000},currency:{type:'string',pattern:'^[A-Z]{3}$'}
  }}}}}
};
