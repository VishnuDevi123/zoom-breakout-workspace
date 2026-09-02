import Router from "express";

const router = Router();

router.get("/", (req, res) => {
    console.log("Test router hit, frontend requested /api/test");
    res.json({
        success: true,
        message: "Test route hit successfully",
    });
    
});

router.get("/hi", (req, res) => {
    res.json({
        success: true,
        message: "Hi from test route"
    })
});

router.post("/session", (req, res) => {
  console.log("Received Zoom session data:", req.body);

  res.json({
    success: true,
    message: "Meeting session received by backend",
    meetingUUID: req.body.meetingUUID,
  });
});

export default router;

