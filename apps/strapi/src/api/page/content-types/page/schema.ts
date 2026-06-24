export default {
  "kind": "collectionType",
  "collectionName": "pages",
  "info": {
    "singularName": "page",
    "pluralName": "pages",
    "displayName": "Page",
    "description": "Editorial site pages managed in Strapi. Draft and publish adds the system publishedAt field."
  },
  "options": {
    "draftAndPublish": true
  },
  "pluginOptions": {},
  "attributes": {
    "title": {
      "type": "string",
      "required": true
    },
    "slug": {
      "type": "uid",
      "targetField": "title",
      "required": true
    },
    "subtitle": {
      "type": "text"
    },
    "pageType": {
      "type": "enumeration",
      "enum": [
        "standard",
        "report"
      ],
      "default": "standard",
      "required": true
    },
    "heroStyle": {
      "type": "enumeration",
      "enum": [
        "simple-blue",
        "none"
      ],
      "default": "simple-blue"
    },
    "body": {
      "type": "richtext",
      "required": true
    },
    "tableData": {
      "type": "json"
    },
    "embedUrl": {
      "type": "text"
    },
    "seo": {
      "type": "component",
      "component": "shared.seo"
    },
    "footer": {
      "type": "component",
      "component": "site.footer"
    }
  }
} as const;
