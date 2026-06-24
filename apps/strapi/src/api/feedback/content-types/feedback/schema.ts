export default {
  "kind": "collectionType",
  "collectionName": "feedbacks",
  "info": {
    "singularName": "feedback",
    "pluralName": "feedbacks",
    "displayName": "Feedback",
    "description": "Contact and feedback submissions from Yukon Connect users."
  },
  "options": {
    "draftAndPublish": false
  },
  "pluginOptions": {},
  "attributes": {
    "name": {
      "type": "string"
    },
    "email": {
      "type": "email"
    },
    "message": {
      "type": "text",
      "required": true
    },
    "context": {
      "type": "json"
    },
    "status": {
      "type": "enumeration",
      "enum": [
        "new",
        "reviewing",
        "resolved",
        "spam"
      ],
      "default": "new",
      "required": true
    }
  }
} as const;
