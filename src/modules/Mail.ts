import nodemailer from 'nodemailer';
import { User, UserCustomer } from './Models';
import hbs from 'handlebars'
import fs from 'fs'
import Utils from './Utils';

export default class Mail {
    private static transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.MAIL_USER,
            pass: process.env.MAIL_PASS
        }
    });

    private static getTemplate(name: string) {
        const file = fs.readFileSync(`${__dirname}/../../handlebars/${name}.hbs`, 'utf-8')
        return hbs.compile(file)
    }

    static async send(to: string[], subject: string, html: string) {
        const mailOptions = {
            from: process.env.MAIL_USER,
            to: to,
            subject: subject,
            html: html
        };

        return new Promise((resolve, reject) => {
            Mail.transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(info);
                }
            })
        })
    }

    static async sendPasswordReset(user: User, token: string, expires: Date) {
        const template = Mail.getTemplate('PasswordReset')
        const html = template({
            username: user.nama,
            resetLink: `${process.env.FRONTEND_URL}/change-password?${new URLSearchParams({ token: token })}`,
            expirationTime: Utils.dateFormatFull.format(expires),
            appName: 'Grand Atma Hotel'
        })

        return Mail.send([user.email], 'Atur Ulang Kata Sandi - TODO: change html content', html)
    }

    static async sendUserActivation(user: UserCustomer, token: string, expires: Date) {
        const template = Mail.getTemplate('RegistrationConfirmation')
        const html = template({
            name: user.nama,
            activationLink: `${process.env.FRONTEND_URL}/verification?${new URLSearchParams({ token: token })}`,
            expirationTime: Utils.dateFormatFull.format(expires),
            appName: 'Grand Atma Hotel'
        })

        return Mail.send([user.email], 'Konfirmasi Pendaftaran', html)
    }
}