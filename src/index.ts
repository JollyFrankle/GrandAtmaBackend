import Middlewares from "./Middlewares";
import AuthController from "./controller/AuthController";
import express from "express";
import KamarController from "./controller/KamarController";
import multer from "multer";

const app = express();

app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(multer().none())

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
app.get("/pegawai/kamar", KamarController.index)
app.post("/pegawai/kamar", KamarController.store)
app.put("/pegawai/kamar/:no_kamar", KamarController.update)
app.delete("/pegawai/kamar/:no_kamar", KamarController.destroy)

// Error 404
app.use(Middlewares.notFound)

app.listen(process.env.PORT, () => {
    console.log(`Server is running on http://localhost:${process.env.PORT}`)
})

process.on('uncaughtException', (err) => {
    console.log(err)
})