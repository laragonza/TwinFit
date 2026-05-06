import { ObjectId } from "mongodb";

export type ClothType = "dress3" | "dress4" | "tshirt" | "denim_mom_jean";
export const SUPPORTED_CLOTH_TYPES: ClothType[] = ["dress3", "dress4", "tshirt", "denim_mom_jean"];

export interface ClothSchema {
    _id: ObjectId;
    name: string;
    type: ClothType;
    modelPath: string; // Path to GLB file
}
