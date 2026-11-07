function shouldExposeDevelopmentResetLink(env = process.env) {
  return env.NODE_ENV === "development" && env.EXPOSE_DEV_RESET_LINK === "true";
}

module.exports = { shouldExposeDevelopmentResetLink };
