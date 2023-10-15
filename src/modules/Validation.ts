import { Request } from "express";

export default class Validation {
    private data: { [key: string]: any };
    private errors: { [key: string]: string } = {};
    private validatedData: { [key: string]: any } = {};

    constructor(data: { [key: string]: string }) {
        this.data = data;
    }

    validate(rules: { [key: string]: ValidationRule }) {
        for (const rule in rules) {
            const value = this.data[rule];

            if (rules[rule].required && !value) {
                this.errors[rule] = `${rule} wajib diisi`;
            } else if (rules[rule].minLength && value.length < rules[rule].minLength!!) {
                this.errors[rule] = `${rule} harus berisi minimal ${rules[rule].minLength} karakter`;
            } else if (rules[rule].maxLength && value.length > rules[rule].maxLength!!) {
                this.errors[rule] = `${rule} harus berisi maksimal ${rules[rule].maxLength} karakter`;
            } else {
                switch (rules[rule].type) {
                    case "email":
                        if (!value.includes("@")) {
                            this.errors[rule] = `${rule} harus berupa email yang valid`;
                        }
                        break;
                    case "number":
                        if (isNaN(value)) {
                            this.errors[rule] = `${rule} harus berupa angka`;
                        } else if (rules[rule].min && value < rules[rule].min!!) {
                            this.errors[rule] = `${rule} harus paling kecil ${rules[rule].min}`;
                        } else if (rules[rule].max && value > rules[rule].max!!) {
                            this.errors[rule] = `${rule} harus paling tinggi ${rules[rule].max}`;
                        }
                        break;
                }
            }

            if (!this.errors[rule]) {
                this.validatedData[rule] = value;
            }
        }

        return this;
    }

    hasErrors() {
        return Object.keys(this.errors).length > 0;
    }

    getErrors() {
        return this.errors;
    }

    /**
     * Get validated data
     */
    validated() {
        return this.data;
    }

    static body(req: Request, rules: { [key: string]: ValidationRule }) {
        return new Validation(req.body).validate(rules);
    }

    static query(req: Request, rules: { [key: string]: ValidationRule }) {
        return new Validation(req.query as { [key: string]: string }).validate(rules);
    }

    static params(req: Request, rules: { [key: string]: ValidationRule }) {
        return new Validation(req.params).validate(rules);
    }
}

interface ValidationRule {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    type?: "email" | "number";
    min?: number;
    max?: number;
}