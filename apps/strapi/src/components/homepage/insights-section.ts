export default {
  "collectionName": "components_homepage_insights_sections",
  "info": {
    "displayName": "Insights Section"
  },
  "attributes": {
    "title": {
      "type": "string",
      "default": "Stay Updated with the Latest Business Insights"
    },
    "description": {
      "type": "text",
      "default": "Explore the most recent reports and opportunities for your business in Yukon."
    },
    "cards": {
      "type": "component",
      "repeatable": true,
      "component": "homepage.report-card"
    }
  }
} as const;
