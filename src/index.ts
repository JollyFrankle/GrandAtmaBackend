import express from "express";
import multer from "multer";
import Middlewares from "./modules/Middlewares";
import AuthController from "./controller/AuthController";
import { router as KamarRouter } from "./controller/KamarController";
import { router as SeasonRouter } from "./controller/SeasonController";

const app = express();

app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(multer().any())

// Middleware
app.use(Middlewares.cors)
app.use("/customer", Middlewares.customer)
app.use("/pegawai", Middlewares.pegawai)

app.post("/login", AuthController.login)
app.post("/register", AuthController.register)

// Customer Middleware
app.post("/customer/logout", AuthController.logoutCustomer)
app.post("/customer/change-password", AuthController.changePasswordC)

// Pegawai Middleware
app.post("/pegawai/logout", AuthController.logoutPegawai)
app.post("/pegawai/change-password", AuthController.changePasswordP)
app.use("/pegawai/kamar", KamarRouter)
app.use("/pegawai/season", SeasonRouter)

// Error 404
app.use(Middlewares.notFound)

app.listen(process.env.PORT, () => {
    console.log(`Server is running on http://localhost:${process.env.PORT}`)
})

process.on('uncaughtException', (err) => {
    console.log(err)
})