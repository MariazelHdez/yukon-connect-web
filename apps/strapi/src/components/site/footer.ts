export default {
  "collectionName": "components_site_footers",
  "info": {
    "displayName": "Footer"
  },
  "attributes": {
    "logo": {
      "type": "media",
      "multiple": false,
      "allowedTypes": [
        "images"
      ]
    },
    "navLinks": {
      "type": "component",
      "repeatable": true,
      "component": "site.nav-link"
    },
    "disclaimer": {
      "type": "text",
      "default": "Yukon Connect Hub is an independent platform and is not affiliated with the Government of Yukon. While we aim to provide accurate and up-to-date information sourced from official public records, we do not accept responsibility for any errors, omissions, or outcomes resulting from its use."
    }
  }
} as const;
