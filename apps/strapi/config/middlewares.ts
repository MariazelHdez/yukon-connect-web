export default [
  'strapi::logger',
  'strapi::errors',
  'strapi::security',
  'strapi::cors',
  'strapi::poweredBy',
  {
    name: 'strapi::favicon',
    config: {
      path: 'public/favicon.svg',
    },
  },
  'strapi::query',
  'strapi::body',
  'strapi::session',
  'strapi::public',
];
