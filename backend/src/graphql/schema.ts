import { gql } from "apollo-server-express";

// Aquí defino cómo son mis datos para que GraphQL los entienda
export const typeDefs = gql`
  type Measures {
    chest: Int
    waist: Int
    hips: Int
  }

  type User {
    id: ID!
    name: String
    gender: String
    height: Int
    weight: Int
    measures: Measures
  }

  type Cloth {
    id: ID!
    name: String
    type: String
    modelPath: String
    # ¿Debería añadir color aquí luego?
  }

  # Estas son las consultas que puedo hacer
  type Query {
    users: [User]
    clothes: [Cloth]
    hello: String
  }
`;
