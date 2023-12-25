import { Response } from "express";

export interface ApiResponseOK {
    message: string;
    data: any;
}

export interface ApiResponseError {
    message: string;
    errors: { [key: string]: string } | null;
}

export class ApiResponse {
    /**
     * Sends a successful API response to the client.
     * @param res - The response object.
     * @param data - The data to send in the response.
     * @param code - The HTTP status code to send in the response. Defaults to 200.
     * @returns The response object.
     */
    static success(res: Response, data: ApiResponseOK, code: number = 200) {
        res.json
        return res.status(code).send(data);
    }

    /**
     * Sends an error response with the specified data and HTTP status code.
     * @param res - The response object.
     * @param data - The error data to send.
     * @param code - The HTTP status code to send.
     * @returns The response object.
     */
    static error(res: Response, data: ApiResponseError, code: number) {
        return res.status(code).send(data);
    }
}