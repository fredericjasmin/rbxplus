module.exports = function isAdmin(req, res, next) {
    if (req.isAuthenticated() && req.user) return next();
    req.session.backURL = req.url;
    res.redirect("/ASFASJFQWFQ@@Idqwriwqqidfqwfqwfoqwfqwoqwqwfjqw");
}