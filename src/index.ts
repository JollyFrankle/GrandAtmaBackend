import express from "express";
import multer from "multer";
import cors from "cors";
import Middlewares from "./modules/Middlewares";
import AuthController from "./controller/AuthController";
import { router as KamarRouter } from "./controller/KamarController";
import { router as SeasonRouter } from "./controller/SeasonController";
import { router as FasilitasRouter } from "./controller/FasilitasController";
import { routerC as UserRouterC, routerP as UserRouterP } from "./controller/UserController";
import { routerC as ReservasiRouterC, routerP as ReservasiRouterP } from "./controller/ReservasiController";
import { router as PDRouter } from "./controller/PublicDataController";
import { routerPublic as BookingRouterPublic, routerC as BookingRouterC, routerP as BookingRouterP } from "./controller/BookingController";
import { router as PdfRouter } from "./controller/PdfController";
import getIP from "./modules/LocalNetwork";
import CronJob from "./modules/CronJob";

const app = express();

app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cors())

// Middleware
app.use(Middlewares.recipient)
app.use("/customer", Middlewares.customer)
app.use("/pegawai", Middlewares.pegawai)

// Public folder
app.use("/public", express.static(`${__dirname}/../public`))

// Public routes
app.use("/public", PDRouter)
app.use("/public/booking", BookingRouterPublic)
app.use("/public/pdf", PdfRouter)

// Authentication
app.post("/login", AuthController.login)
app.post("/login-customer", AuthController.loginCustomer)
app.post("/login-pegawai", AuthController.loginPegawai)
app.post("/register", AuthController.register)
app.post("/confirm-email", AuthController.confirmEmail)
app.post("/reset-password", AuthController.resetPassword)
app.patch("/reset-password/:token", AuthController.changePassword)

// Customer Middleware
app.post("/customer/logout", AuthController.logoutCustomer)
app.use("/customer/user", UserRouterC)
app.use("/customer/reservasi", ReservasiRouterC)
app.use("/customer/booking", BookingRouterC)

// Pegawai Middleware
app.post("/pegawai/logout", AuthController.logoutPegawai)
app.use("/pegawai/kamar", KamarRouter)
app.use("/pegawai/season", SeasonRouter)
app.use("/pegawai/fasilitas", FasilitasRouter)
app.use("/pegawai/customer", UserRouterP)
app.use("/pegawai/reservasi", ReservasiRouterP)
app.use("/pegawai/booking", BookingRouterP)

// Error 404
app.use(Middlewares.notFound)

app.listen(process.env.PORT, () => {
    const localIP = getIP()
    console.log(`Server is running on:`)
    console.log(`  Local:    http://localhost:${process.env.PORT}`)
    if (localIP) {
        console.log(`  Network:  http://${localIP}:${process.env.PORT}\n`)
    }
})

process.on('uncaughtException', (err) => {
    console.log(err)
});

(() => CronJob.run())();