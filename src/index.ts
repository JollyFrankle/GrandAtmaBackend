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

const app = express();

app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(multer().any())
app.use(cors())

// Middleware
app.use(Middlewares.recipient)
app.use("/customer", Middlewares.customer)
app.use("/pegawai", Middlewares.pegawai)

// Public routes
app.use("/public", PDRouter)

// Authentication
app.post("/login", AuthController.login)
app.post("/register", AuthController.register)
app.post("/change-password", AuthController.changePassword)
app.post("/reset-password", AuthController.resetPassword)

// Customer Middleware
app.post("/customer/logout", AuthController.logoutCustomer)
app.use("/customer/user", UserRouterC)
app.use("/customer/reservasi", ReservasiRouterC)

// Pegawai Middleware
app.post("/pegawai/logout", AuthController.logoutPegawai)
app.use("/pegawai/kamar", KamarRouter)
app.use("/pegawai/season", SeasonRouter)
app.use("/pegawai/fasilitas", FasilitasRouter)
app.use("/pegawai/user", UserRouterP)
app.use("/pegawai/reservasi", ReservasiRouterP)

// Error 404
app.use(Middlewares.notFound)

app.listen(process.env.PORT, () => {
    console.log(`Server is running on http://localhost:${process.env.PORT}`)
})

process.on('uncaughtException', (err) => {
    console.log(err)
})