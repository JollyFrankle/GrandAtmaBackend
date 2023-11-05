import { Request } from "express";
import moment from "moment-timezone";

function momentOrDateToDate(input: moment.Moment | Date, type: 'datetime' | 'timestamp') {
    if (input instanceof Date) {
        return input
    } else {
        return type === 'datetime' ? input.toDate() : input.add(moment().utcOffset(), 'minutes').toDate()
    }
}

function stringToDate(input: string, type: 'datetime' | 'timestamp') {
    return type === 'datetime' ? moment(input).add(moment().utcOffset(), 'minutes').toDate() : moment(input).toDate()
}

function getHumanReadableKey(key: string) {
    const converted = key.split(/[-_.]|(?=[A-Z])/)
    return converted.map((word) => {
        return word.charAt(0).toUpperCase() + word.slice(1)
    }).join(" ")
}

export default class Validation {
    private data: KeyValue<any>;
    errors: KeyValue<string> = {};
    private validatedData: KeyValue<any> = {};
    private rules: KeyValue<ValidationRule> = {};

    constructor(data: KeyValue<string>, rules: KeyValue<ValidationRule> = {}) {
        this.data = data;
        this.rules = rules;
    }

    private vrDate(key: string, humanReadableKey: string, type: 'datetime' | 'timestamp') {
        // Validation rule for datetime and timestamp
        const rule = this.rules[key];
        const value = this.data[key];
        const date = type === 'datetime' ? moment(value).add(moment().utcOffset(), 'minutes') : moment(value)

        if (!date.isValid()) {
            this.errors[key] = `${humanReadableKey} harus berupa tanggal yang valid`;
        } else if (rule.after || rule.before) {
            if (rule.after) {
                if (typeof rule.after === "string") {
                    // if minDate is a string, it must be a key of rules
                    const minDate = stringToDate(this.validatedData[rule.after!! as string], type)
                    if (date.isBefore(minDate)) {
                        this.errors[key] = `${humanReadableKey} tidak boleh sebelum ${rule.after}`;
                    }
                } else if (date.isBefore(momentOrDateToDate(rule.after, type))) {
                    // if date | moment
                    this.errors[key] = `${humanReadableKey} harus paling cepat ${rule.after}`;
                }
            } else if (rule.before) {
                if (typeof rule.before === "string") {
                    // if maxDate is a string, it must be a key of rules
                    const maxDate = stringToDate(this.validatedData[rule.before!! as string], type)
                    if (date.isAfter(maxDate)) {
                        this.errors[key] = `${humanReadableKey} tidak boleh setelah ${rule.before}`;
                    }
                } else if (date.isAfter(momentOrDateToDate(rule.before, type))) {
                    // if date | moment
                    this.errors[key] = `${humanReadableKey} harus paling lambat ${rule.before}`;
                }
            }
        }

        if (!this.errors[key]) {
            this.validatedData[key] = date.toDate()
        }
    }

    validate() {
        for (const key in this.rules) {
            const value = this.data[key];
            const rule = this.rules[key];
            const humanReadableKey = getHumanReadableKey(key)

            if (rule.required && (!value && value !== 0)) {
                this.errors[key] = `${humanReadableKey} wajib diisi`;
            } else if (!value) {
                // no value and not required, ignore further checks
            } else if (rule.minLength && value.length < rule.minLength!!) {
                this.errors[key] = `${humanReadableKey} harus berisi minimal ${rule.minLength} karakter`;
            } else if (rule.maxLength && value.length > rule.maxLength!!) {
                this.errors[key] = `${humanReadableKey} harus berisi maksimal ${rule.maxLength} karakter`;
            } else if (rule.in && !rule.in!!.includes(value)) {
                this.errors[key] = `${humanReadableKey} harus salah satu dari ${rule.in}`;
            } else {
                switch (rule.type) {
                    case "email":
                        if (!value.includes("@")) {
                            this.errors[key] = `${humanReadableKey} harus berupa email yang valid`;
                        }
                        break;
                    case "number":
                        if (isNaN(value)) {
                            this.errors[key] = `${humanReadableKey} harus berupa angka`;
                        } else if (rule.min && value < rule.min!!) {
                            this.errors[key] = `${humanReadableKey} harus paling kecil ${rule.min}`;
                        } else if (rule.max && value > rule.max!!) {
                            this.errors[key] = `${humanReadableKey} harus paling tinggi ${rule.max}`;
                        } else {
                            // [OK] Validated
                            this.validatedData[key] = +value
                        }
                        break;
                    case "timestamp":
                        this.vrDate(key, humanReadableKey, 'timestamp')
                        break;
                    case "datetime":
                        this.vrDate(key, humanReadableKey, 'datetime')
                        break;
                    case "array":
                        if (!Array.isArray(value)) {
                            this.errors[key] = `${humanReadableKey} harus berupa array`;
                        } else if (rule.required && value.length === 0) {
                            this.errors[key] = `${humanReadableKey} wajib diisi`;
                        }
                        break;
                    case "file_single":
                        if (!value?.mimetype?.includes("image")) {
                            this.errors[key] = `${humanReadableKey} harus berupa gambar`;
                        }
                        break;
                }

                if (!this.validatedData[key] && rule.customRule) {
                    const customRuleResult = rule.customRule!!(value)
                    if (customRuleResult) {
                        this.errors[key] = customRuleResult
                    }
                }
            }

            if (!this.validatedData[key]) {
                this.validatedData[key] = value;
            }
        }

        // console.log(this.validatedData)
        return this;
    }

    fails() {
        return Object.keys(this.errors).length > 0;
    }

    /**
     * Get validated data
     */
    validated() {
        return this.validatedData;
    }

    errorToString() {
        return Object.values(this.errors).join("\n");
    }

    static body(req: Request, rules: { [key: string]: ValidationRule }) {
        return new Validation(req.body, rules).validate();
    }

    static query(req: Request, rules: { [key: string]: ValidationRule }) {
        return new Validation(req.query as { [key: string]: string }, rules).validate();
    }

    static params(req: Request, rules: { [key: string]: ValidationRule }) {
        return new Validation(req.params, rules).validate();
    }
}

interface ValidationRule {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    in?: any[];
    type?: "email" | "number" | "datetime" | "timestamp" | "array" | "file_single";
    min?: number;
    max?: number;
    after?: Date | moment.Moment | string;
    before?: Date | moment.Moment | string;
    customRule?: (value: any) => string | null;
}

interface KeyValue<T> {
    [key: string]: T
}