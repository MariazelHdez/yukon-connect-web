export default {
  "kind": "collectionType",
  "collectionName": "search_tags",
  "info": {
    "singularName": "search-tag",
    "pluralName": "search-tags",
    "displayName": "SearchTag",
    "description": "Editorially managed tags for search filters and content metadata. Not a replacement for the contract search index."
  },
  "options": {
    "draftAndPublish": false
  },
  "pluginOptions": {},
  "attributes": {
    "name": {
      "type": "string",
      "required": true,
      "unique": true
    },
    "slug": {
      "type": "uid",
      "targetField": "name",
      "required": true
    },
    "category": {
      "type": "string",
      "required": true
    },
    "description": {
      "type": "text"
    }
  }
} as const;
