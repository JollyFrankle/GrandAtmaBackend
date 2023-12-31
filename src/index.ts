import express from "express";
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
import { router as UserPegawaiRouter } from "./controller/UserPegawaiController";
import { router as CICORouter } from "./controller/CheckInOutController";
import { router as LaporanRouter } from "./controller/LaporanController";
import { router as FnBRouter } from "./controller/FnBController";
import { router as FnBKRouter } from "./controller/FnBKategoriController";
import getIP from "./modules/LocalNetwork";
import CronJob from "./modules/CronJob";
import Utils from "./modules/Utils";

const app = express();

app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cors())

// Public folder
app.use("/p", express.static(`${__dirname}/../public`))

// Middleware
app.use(Middlewares.recipient)
app.use("/customer", Middlewares.customer)
app.use("/pegawai", Middlewares.pegawai)

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
app.use("/pegawai/users", UserPegawaiRouter)
app.use("/pegawai/fo", CICORouter)
app.use("/pegawai/laporan", LaporanRouter) // @deprecated - not used
app.use("/pegawai/fnb", FnBRouter)
app.use("/pegawai/fnb-kategori", FnBRouter)

// Ping
app.get("/ping", Middlewares.ping)

// Fallback: Error 404
app.use(Middlewares.notFound)

export const LOCAL_URL = `http://localhost:${process.env.PORT}`;

(async () => {
    await Utils.init()
    app.listen(process.env.PORT, () => {
        const localIP = getIP()
        console.log(`Server is running on:`)
        console.log(`  Local:    ${LOCAL_URL}`)
        if (localIP) {
            console.log(`  Network:  http://${localIP}:${process.env.PORT}\n`)
        }
    })
    CronJob.run()
})()


process.on('uncaughtException', (err) => {
    console.log(err)
});