export default {
  "kind": "collectionType",
  "collectionName": "search_synonyms",
  "info": {
    "singularName": "search-synonym",
    "pluralName": "search-synonyms",
    "displayName": "SearchSynonym",
    "description": "Editorial synonyms that can inform search UX and preprocessing without storing contract records in Strapi."
  },
  "options": {
    "draftAndPublish": false
  },
  "pluginOptions": {},
  "attributes": {
    "term": {
      "type": "string",
      "required": true
    },
    "synonym": {
      "type": "string",
      "required": true
    },
    "category": {
      "type": "string"
    }
  }
} as const;
