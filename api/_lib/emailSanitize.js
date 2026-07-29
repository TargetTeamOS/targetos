'use strict'
// api/_lib/emailSanitize.js — strict allowlist sanitizer for provider email
// HTML, applied BEFORE anything is written to the database. Uses the proven
// sanitize-html parser (never regex-only). Strips script/style execution,
// event handlers, iframe/object/embed, forms, and javascript:/data:
// executable URLs, while preserving normal email formatting and safe links.

const sanitizeHtml = require('sanitize-html')

const OPTIONS = {
  allowedTags: [
    'a', 'b', 'i', 'em', 'strong', 'u', 's', 'strike', 'sub', 'sup', 'small',
    'p', 'br', 'hr', 'div', 'span', 'blockquote', 'pre', 'code',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col',
    'img', 'figure', 'figcaption',
  ],
  allowedAttributes: {
    a: ['href', 'name', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    '*': ['align', 'colspan', 'rowspan'],
  },
  // Only safe URL schemes; blocks javascript:, data: (for links), vbscript:, file:
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['http', 'https', 'cid'] }, // inline images may use cid:
  allowedSchemesAppliedToAttributes: ['href', 'src'],
  allowProtocolRelative: false,
  // Drop the CONTENTS of executable/embedding tags entirely.
  nonTextTags: ['script', 'style', 'textarea', 'noscript', 'iframe', 'object', 'embed', 'form', 'template'],
  disallowedTagsMode: 'discard',
  enforceHtmlBoundary: false,
  transformTags: {
    a: (tagName, attribs) => {
      const out = Object.assign({}, attribs)
      // Harden external links.
      out.rel = 'noopener noreferrer nofollow'
      if (out.target == null) out.target = '_blank'
      return { tagName: 'a', attribs: out }
    },
  },
}

function sanitizeEmailHtml(html) {
  if (html == null || html === '') return html
  try { return sanitizeHtml(String(html), OPTIONS) }
  catch (e) { return '' } // fail closed: never store unsanitized HTML
}

module.exports = { sanitizeEmailHtml, OPTIONS }
