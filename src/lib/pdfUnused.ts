// Stands in for jsPDF's optional extras (html2canvas, dompurify, canvg) in app builds.
// They only serve doc.html() and SVG images, which Reports never use; without this they
// would ship as ~380 kB of chunks the service worker precaches for nothing.
const unused = () => {
  throw new Error('This jsPDF feature is not included in Steady')
}
export default unused
export const Canvg = unused
