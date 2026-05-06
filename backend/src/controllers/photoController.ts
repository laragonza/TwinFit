import { Request, Response } from "express";

// Este endpoint ya no se utiliza. La introducción de medidas es manual desde el frontend.
export const analyzePhoto = async (_req: Request, res: Response) => {
    return res.status(410).json({
        error: "El análisis automático por IA ha sido desactivado. Introduce tus medidas manualmente en el formulario."
    });
};
