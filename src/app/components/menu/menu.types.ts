export interface MenuBrand {
  id: string;
  name: string;
  slug?: string;
}

export interface MenuCategory {
  id: string;
  name: string;
  slug?: string;
  brands: MenuBrand[];
}

export type MenuItemProps = { category: MenuCategory };
