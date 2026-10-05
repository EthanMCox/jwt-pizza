enum Role {
  Diner = 'diner',
  Franchisee = 'franchisee',
  Admin = 'admin',
}

namespace Role {
  export function isRole(user: User | null, role: Role): boolean {
    return user != null && Array.isArray(user.roles) && !!user.roles.find((r) => r.role === role);
  }
}

type Menu = Pizza[];

type Pizza = {
  id: number;
  title: string;
  description: string;
  image: string;
  price: number;
};

type OrderItem = {
  menuId: number;
  description: string;
  price: number;
};

type Order = {
  id: number;
  franchiseId: number;
  storeId: number;
  date: string;
  items: OrderItem[];
};

type OrderResponse = {
  order: Order;
  jwt: string;
};

type OrderHistory = {
  id: number;
  dinerId: number;
  orders: Order[];
};

type UserRole = {
  role: Role;
  objectId?: number;
};

type User = {
  id?: number;
  name?: string;
  email?: string;
  password?: string;
  roles?: UserRole[];
};

type Store = {
  id: number;
  name: string;
  totalRevenue?: number;
};

type Franchise = {
  id: number;
  admins?: { email: string; id?: number; name?: string }[];
  name: string;
  stores: Store[];
};

type FranchiseList = {
  franchises: Franchise[];
  more: boolean;
};

type UserList = {
  users: User[];
  more: boolean;
};

type Endpoint = {
  requiresAuth: boolean;
  method: string;
  path: string;
  description: string;
  example: string;
  response: any;
};

type Endpoints = {
  endpoints: Endpoint[];
};

type JWTPayload = {
  message: string;
  payload: string;
};

interface PizzaService {
  login(email: string, password: string): Promise<User>;
  register(email: string, password: string, role: string): Promise<User>;
  logout(): void;
  getUser(): Promise<User | null>;
  getMenu(): Promise<Menu>;
  getOrders(user: User): Promise<OrderHistory>;
  order(order: Order): Promise<OrderResponse>;
  verifyOrder(jwt: string): Promise<JWTPayload>;
  getFranchise(user: User): Promise<Franchise[]>;
  createFranchise(franchise: Franchise): Promise<Franchise>;
  getFranchises(page: number, limit: number, nameFilter: string): Promise<FranchiseList>;
  closeFranchise(franchise: Franchise): Promise<void>;
  createStore(franchise: Franchise, store: Store): Promise<Store>;
  closeStore(franchise: Franchise, store: Store): Promise<null>;
  docs(docType: string): Promise<Endpoints>;
  updateUser(user: User): Promise<User>;
  getUsers(page: number, limit: number, nameFilter: string): Promise<UserList>;
  deleteUser(user: User): Promise<void>;
}

export { Role, PizzaService, User, Menu, Pizza, OrderHistory, Order, Franchise, FranchiseList, UserList, Store, OrderItem, Endpoint, Endpoints, OrderResponse, JWTPayload };
