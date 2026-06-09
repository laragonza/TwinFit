export type BodyDimensionMap = Record<string, number>;

export interface AnthropometricProfile {
    schemaVersion: 1;
    unit: "cm";
    stature: number;
    dimensions: BodyDimensionMap;
    requiredDimensions: string[];
}

export interface CoreBodyMeasures {
    chest: number;
    waist: number;
    hips: number;
}

export const CORE_BODY_DIMENSIONS = ["chest", "waist", "hips"] as const;

export const BODY_DIMENSION_LABELS: Record<string, string> = {
    chest: "contorno toracico",
    waist: "contorno de cintura",
    hips: "contorno de cadera",
};

const toPositiveNumber = (value: unknown) => {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
};

export const normalizeDimensionMap = (value: unknown): BodyDimensionMap => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};

    return Object.entries(value as Record<string, unknown>).reduce<BodyDimensionMap>(
        (dimensions, [key, rawValue]) => {
            const numericValue = toPositiveNumber(rawValue);
            if (numericValue !== null) dimensions[key] = numericValue;
            return dimensions;
        },
        {},
    );
};

export const buildAnthropometricProfile = (input: Record<string, unknown>) => {
    const rawProfile = input.anthropometricProfile as
        | { stature?: unknown; statureCm?: unknown; dimensions?: unknown }
        | undefined;
    const stature = toPositiveNumber(rawProfile?.stature ?? rawProfile?.statureCm ?? input.height);
    const dimensions = normalizeDimensionMap(
        rawProfile?.dimensions ?? input.bodyDimensions ?? input.dimensions ?? input.measures,
    );
    const missingDimensions = CORE_BODY_DIMENSIONS.filter((key) => !dimensions[key]);
    const missing: string[] = [];

    if (!stature) missing.push("estatura");
    if (missingDimensions.length > 0) {
        missing.push(
            `perfil antropometrico: ${missingDimensions
                .map((key) => BODY_DIMENSION_LABELS[key] ?? key)
                .join(", ")}`,
        );
    }

    return {
        missing,
        profile: stature
            ? {
                schemaVersion: 1 as const,
                unit: "cm" as const,
                stature,
                dimensions,
                requiredDimensions: [...CORE_BODY_DIMENSIONS],
            }
            : null,
    };
};

export const extractCoreMeasures = (profile: AnthropometricProfile): CoreBodyMeasures => ({
    chest: profile.dimensions.chest,
    waist: profile.dimensions.waist,
    hips: profile.dimensions.hips,
});
