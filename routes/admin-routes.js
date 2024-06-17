const express = require('express');
const router = express.Router();
const multer = require('multer')
const multerS3 = require('multer-s3')
const { S3Client } = require('@aws-sdk/client-s3')
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');

const admin_controller = require('../controllers/AdminController');

const upload = multer();
const maxSize = 4 * 1024 * 1024;

const s3Client = new S3Client({
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_S3_ACCESS_KEY,
    secretAccessKey: process.env.AWS_S3_SECRET_ACCESS_KEY,
  },
});

var uploadCollectionFile = multer({
  storage: multerS3({
    s3: s3Client,
    bucket: process.env.AWS_S3_FILE_BUCKET,
    acl: 'public-read',
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: function (req, file, cb) {
      cb(null, `collections/${file.fieldname}/${uuidv4()}-${Date.now()}`)
    }
  }),
  limits: { fileSize: maxSize },
}).fields([
  { name: 'originals', maxCount: 1 },
  { name: 'lows', maxCount: 1 },
  { name: 'mediums', maxCount: 1 },
  { name: 'highs', maxCount: 1 },
  { name: 'banners', maxCount: 1 }
]);

var uploadFeaturedColFile = multer({
  storage: multerS3({
    s3: s3Client,
    bucket: process.env.AWS_S3_FILE_BUCKET,
    acl: 'public-read',
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: function (req, file, cb) {
      cb(null, `collections/featured/${uuidv4()}-${Date.now()}`)
    }
  }),
  // limits: { fileSize: maxSize },
}).fields([
  { name: 'bg', maxCount: 1 },
  { name: 'logo', maxCount: 1 }
]);


// prize create upload image

var contestUpoloadImage = multer({
	storage: multerS3({
		s3: s3Client,
		bucket: process.env.AWS_S3_FILE_BUCKET,
		acl: "public-read",
		contentType: multerS3.AUTO_CONTENT_TYPE,
		key: function (req, file, cb) {
			cb(null, `contest/${file.fieldname}/${uuidv4()}-${Date.now()}`);
		},
	}),
	limits: { fileSize: maxSize },
}).single('prize_image')

/**
 *  Admin Management
 */

// router.post('/api/login', (req, res, next) => {
//   admin_controller.login(req, res, next);
// });

router.post('/api/login_from_wallet', (req, res, next) => {
  admin_controller.loginFromWallet(req, res, next);
});


/**
 *  Company Management
 */

router.post("/api/update_whitelist", [admin_controller.authenticateAdmin], (req, res, next) => {
  admin_controller.updateWhitelist(req, res, next)
});

router.post("/api/confirm_verify", [admin_controller.authenticateAdmin], (req, res, next) => {
  admin_controller.confirmVerify(req, res, next)
});

router.post("/api/set_visible", [admin_controller.authenticateAdmin], (req, res, next) => {
  admin_controller.setVisible(req, res, next)
});

router.post("/api/overview", [admin_controller.authenticateAdmin], (req, res, next) => {
  admin_controller.getOverview(req, res, next)
});

router.post("/api/claims", [admin_controller.authenticateAdmin], (req, res, next) => {
  admin_controller.getClaims(req, res, next)
});

router.post("/api/lootboxes", [admin_controller.authenticateAdmin], (req, res, next) => {
  admin_controller.getLootBoxes(req, res, next)
});

router.post("/api/lootbox/update", [admin_controller.authenticateAdmin], (req, res, next) => {
  admin_controller.updateLootBox(req, res, next)
});

router.post("/api/collections", [admin_controller.authenticateAdmin], (req, res, next) => {
  admin_controller.getCollections(req, res, next)
});

router.post("/api/collection_detail", [admin_controller.authenticateAdmin], (req, res, next) => {
  admin_controller.getCollectionDetail(req, res, next)
});

router.post("/api/update_collection", [uploadCollectionFile, admin_controller.authenticateAdmin], (req, res, next) => {
  admin_controller.updateCollection(req, res, next)
});

router.post("/api/update_featured_collection", [uploadFeaturedColFile, admin_controller.authenticateAdmin], (req, res, next) => {
  admin_controller.updateFeaturedCol(req, res, next)
});


// Heart heads v1

// contest Create for heart heads

router.post("/api/contest_create",[contestUpoloadImage,admin_controller.authenticateAdmin], (req, res, next) => {
  admin_controller.contestCreate(req, res, next)
});

// contest Update for heart heads
// upload.none()  if no image and pass form data add this middleware
router.patch("/api/contest_update/:id", [[contestUpoloadImage,admin_controller.authenticateAdmin]],(req, res, next) => {
  admin_controller.editContest(req, res, next)
});

// contest Delete for heart heads

router.delete("/api/contest_delete/:id", async(req, res, next) => {
  admin_controller.deleteContest(req, res, next)
});

// contest list for heart heads

router.get("/api/contest_list", async(req, res, next) => {
  admin_controller.getContestList(req, res, next)
});

// contest winner list for contest heart heads   

router.get("/api/contest_winner_list/:id", async(req, res, next) => {
  admin_controller.getContestWinnerList(req, res, next)
});


// select winner
router.post("/api/contest_select_winners",admin_controller.authenticateAdmin, (req, res, next) => {
  admin_controller.selectWinners(req, res, next)
});

// select winner update
router.patch("/api/contest_update_select_winners/:account",admin_controller.authenticateAdmin, (req, res, next) => {
  admin_controller.selectWinnersUpdate(req, res, next)
});


// select winner Remove / Delete 

router.delete("/api/contest_select_winner_delete/:account", async(req, res, next) => {
  admin_controller.deleteselectWinners(req, res, next)
});

// select previous winners list

router.get("/api/contest_previous_winners_list", async(req, res, next) => {
  admin_controller.getSelectPreviousWinners(req, res, next)
});
module.exports = router;
