/**
 * Breadcrumb — ประเทศไทย › จังหวัด › เขต/อำเภอ — the CityMETER production hierarchy, through the shared shell
 * (js/shell/breadcrumb.js, citymeter-shell). Every administrative crumb carries its production deep link
 * `/v3/citymeter/{province}[/D/{district}]?d=factory`; a factory
 * is the panel heading, never a crumb.
 */
import {provinceByCode} from './model.js';
import {areaWord} from './areas.js';
import {buildBreadcrumb as shellBreadcrumb, renderBreadcrumb, breadcrumbText, deepestHref} from './shell/breadcrumb.js';

/** Production dataset code (`?d=`). */
export const DATASET = 'factory';

/** Pure model. province = production code or ''; area = index record or null. */
export const buildBreadcrumb = (sel = {}) => shellBreadcrumb(sel, {dataset: DATASET, provinceByCode, areaWord});
export {renderBreadcrumb, breadcrumbText};

/** Production deep link of the deepest administrative crumb (for “ดูใน CityMETER”). */
export const productionHref = crumbs => deepestHref(crumbs, DATASET);
