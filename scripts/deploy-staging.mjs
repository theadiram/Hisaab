// Deployment must originate from the reviewed GitHub commit and its passing CI.
console.error(
  'Direct folder deployment is disabled. Finish validation, push the reviewed commit to GitHub, and connect that repository to Netlify. Keep public release disabled until the data and operating gates pass.',
);
process.exitCode = 1;
