export default {
  "collectionName": "components_site_nav_links",
  "info": {
    "displayName": "Nav Link"
  },
  "attributes": {
    "label": {
      "type": "string",
      "required": true
    },
    "href": {
      "type": "string",
      "required": true
    },
    "children": {
      "type": "component",
      "repeatable": true,
      "component": "site.nav-link"
    }
  }
} as const;
