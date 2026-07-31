export type Food = {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  barcode?: string;
  brand?: string;
  source?: "Egen" | "Matvaretabellen" | "Open Food Facts" | "Standard";
  isNorwegianProduct?: boolean;
};

export type Meal =
  | "Frokost"
  | "Lunsj"
  | "Middag"
  | "Mellommåltid";

export type DiaryItem = Food & {
  diaryId: string;
  amountGrams?: number;
  meal: Meal;
};

export type DiaryMap = Record<string, DiaryItem[]>;

export type WeightEntry = {
  id: string;
  date: string;
  weightKg: number;
};

export type RecipeIngredient = {
  id: string;
  food: Food;
  amountGrams: number;
};

export type Recipe = {
  id: string;
  name: string;
  servings: number;
  ingredients: RecipeIngredient[];
};

export type MealTemplateItem = {
  id: string;
  food: Food;
  amountGrams: number;
};

export type MealTemplate = {
  id: string;
  name: string;
  meal: Meal;
  items: MealTemplateItem[];
};

export type Profile = {
  name: string;
  age: string;
  heightCm: string;
  weightKg: string;
  targetWeightKg: string;
  proteinGoal: string;
  carbsGoal: string;
  fatGoal: string;
  sex: "Mann" | "Kvinne";
  activity:
    | "Lite aktiv"
    | "Lett aktiv"
    | "Moderat aktiv"
    | "Veldig aktiv";
  goal: "Gå ned" | "Holde vekten" | "Gå opp";
};

export type MatvaretabellenFood = {
  id?: string;
  name?: string;
  synonym?: string;
  Energi2?: { value?: string | number };
  Protein?: { value?: string | number };
  Karbo?: { value?: string | number };
  Fett?: { value?: string | number };
};

export type MatvaretabellenResponse = {
  foods?: MatvaretabellenFood[];
};

export type OpenFoodFactsSearchResponse = {
  products?: Array<{
    code?: string;
    product_name?: string;
    product_name_no?: string;
    generic_name?: string;
    brands?: string;
    countries_tags?: string[];
    nutriments?: {
      ["energy-kcal_100g"]?: number;
      proteins_100g?: number;
      carbohydrates_100g?: number;
      fat_100g?: number;
    };
  }>;
};

export type OpenFoodFactsResponse = {
  status?: number;
  product?: {
    product_name?: string;
    product_name_no?: string;
    generic_name?: string;
    code?: string;
    nutriments?: {
      ["energy-kcal_100g"]?: number;
      ["energy-kcal"]?: number;
      proteins_100g?: number;
      proteins?: number;
      carbohydrates_100g?: number;
      carbohydrates?: number;
      fat_100g?: number;
      fat?: number;
    };
  };
};


export type AppTheme =
  | "Classic Dark"
  | "AMOLED"
  | "Midnight Blue"
  | "Purple Night"
  | "Emerald"
  | "Light";
