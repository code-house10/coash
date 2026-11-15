"use client";
// ponytail: PDF = the browser's "Save as PDF" print dialog plus a print stylesheet. Add a PDF library only if a real file download is needed.
export const PrintButton = ({ label }: { label: string }) => <button className="btn ghost no-print" onClick={() => window.print()}>{label}</button>;
