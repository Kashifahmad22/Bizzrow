function tokenVersionMatches(tokenVersion, userTokenVersion) {
  return (tokenVersion ?? 0) === (userTokenVersion ?? 0);
}

module.exports = { tokenVersionMatches };
