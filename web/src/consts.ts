// Place any global data in this file.
// You can import this data from anywhere in your site by using the `import` keyword.

export const SITE_TITLE = "Delfi Crisis Portal";
export const SITE_DESCRIPTION = "Emergency Operation Delfi";
export const ALERT = {
  active: true,
  message: "THIS IS NOT A REAL NEWS PORTAL! IT IS FOR DEMONSTRATION PURPOSES ONLY!!",
};

export const FOOTER_COPYRIGHT_TEXT =
  "Emergency Operation Delfi. THIS IS NOT A REAL NEWS PORTAL. IT IS FOR DEMONSTRATION PURPOSES ONLY.";

export const DATE_LOCALE = "et-EE";
export const DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
};

export const DATE_TIME_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  ...DATE_FORMAT_OPTIONS,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
};
