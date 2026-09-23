import { Page } from '@playwright/test';
import { test, expect } from 'playwright-test-coverage';
import { Role, User } from '../src/service/pizzaService';

type MockApiUser = Omit<User, 'id'> & { id?: string | number };

type AuthFixture = {
  user: MockApiUser;
  password: string;
  token: string;
};

type AuthMocks = {
  users?: Record<string, AuthFixture>;
  registration?: {
    request: { name: string; email: string; password: string };
    user: MockApiUser;
    token: string;
  };
};

async function mockAuthApi(page: Page, mocks: AuthMocks) {
  let loggedInUser: MockApiUser | undefined;

  await page.route('*/**/api/auth', async (route) => {
    const request = route.request();
    const method = request.method();

    if (method === 'POST') {
      if (!mocks.registration) {
        await route.fulfill({ status: 401, json: { error: 'Unauthorized' } });
        return;
      }
      expect(request.postDataJSON()).toMatchObject(mocks.registration.request);
      loggedInUser = mocks.registration.user;
      await route.fulfill({ json: { user: loggedInUser, token: mocks.registration.token } });
      return;
    }

    if (method === 'PUT') {
      const loginReq = request.postDataJSON();
      const fixture = mocks.users?.[loginReq.email];
      if (!fixture || fixture.password !== loginReq.password) {
        await route.fulfill({ status: 401, json: { error: 'Unauthorized' } });
        return;
      }
      expect(loginReq).toMatchObject({ email: fixture.user.email, password: fixture.password });
      loggedInUser = fixture.user;
      await route.fulfill({ json: { user: loggedInUser, token: fixture.token } });
      return;
    }

    expect(method).toBe('DELETE');
    loggedInUser = undefined;
    await route.fulfill({ json: { message: 'logout successful' } });
  });

  await page.route('*/**/api/user/me', async (route) => {
    expect(route.request().method()).toBe('GET');
    await route.fulfill({ json: loggedInUser });
  });
}

async function mockMenuApi(page: Page, menuRes: any[]) {
  await page.route('*/**/api/order/menu', async (route) => {
    expect(route.request().method()).toBe('GET');
    await route.fulfill({ json: menuRes });
  });
}

async function mockFranchiseListApi(page: Page, responseForUrl: (url: URL) => unknown) {
  await page.route(/\/api\/franchise\?/, async (route) => {
    expect(route.request().method()).toBe('GET');
    await route.fulfill({ json: responseForUrl(new URL(route.request().url())) });
  });
}

async function mockOrderApi(page: Page, handlers: { get?: () => unknown; post: (orderReq: any) => unknown }) {
  await page.route('*/**/api/order', async (route) => {
    const request = route.request();
    if (request.method() === 'GET' && handlers.get) {
      await route.fulfill({ json: handlers.get() });
      return;
    }

    expect(request.method()).toBe('POST');
    await route.fulfill({ json: handlers.post(request.postDataJSON()) });
  });
}

async function mockOrderVerificationApi(page: Page, jwt: string, verifyRes: { message: string; payload: string }) {
  await page.route('**/api/order/verify', async (route) => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().postDataJSON()).toMatchObject({ jwt });
    await route.fulfill({ json: verifyRes });
  });
}

async function mockFranchiseeStoreApi(page: Page, user: MockApiUser, franchise: any) {
  let nextStoreId = 2;

  await page.route(`*/**/api/franchise/${user.id}`, async (route) => {
    expect(route.request().method()).toBe('GET');
    await route.fulfill({ json: [franchise] });
  });

  await page.route(`*/**/api/franchise/${franchise.id}/store`, async (route) => {
    const storeReq = route.request().postDataJSON();
    const storeRes = { id: nextStoreId++, name: storeReq.name, totalRevenue: 0 };
    expect(route.request().method()).toBe('POST');
    expect(storeReq).toMatchObject({ name: expect.any(String) });
    franchise.stores.push(storeRes);
    await route.fulfill({ json: storeRes });
  });

  await page.route(new RegExp(`/api/franchise/${franchise.id}/store/\\d+$`), async (route) => {
    expect(route.request().method()).toBe('DELETE');
    const storeId = Number(new URL(route.request().url()).pathname.split('/').pop());
    franchise.stores = franchise.stores.filter((store: any) => store.id !== storeId);
    await route.fulfill({ json: { message: 'store deleted' } });
  });
}

async function mockAdminFranchiseApi(page: Page, franchises: any[], franchiseAdmin: MockApiUser) {
  let nextFranchiseId = Math.max(...franchises.map((franchise) => franchise.id)) + 1;

  await mockFranchiseListApi(page, (url) => {
    const nameFilter = url.searchParams.get('name') || '*';
    const searchName = nameFilter.replace(/\*/g, '').toLowerCase();
    return {
      franchises: franchises.filter((franchise) => franchise.name.toLowerCase().includes(searchName)),
      more: false,
    };
  });

  await page.route('*/**/api/franchise', async (route) => {
    const franchiseReq = route.request().postDataJSON();
    expect(route.request().method()).toBe('POST');
    expect(franchiseReq.admins[0].email).toBe(franchiseAdmin.email);
    const franchiseRes = {
      ...franchiseReq,
      id: nextFranchiseId++,
      admins: [{ id: franchiseAdmin.id, name: franchiseAdmin.name, email: franchiseAdmin.email }],
      stores: [],
    };
    franchises.push(franchiseRes);
    await route.fulfill({ json: franchiseRes });
  });

  await page.route(/\/api\/franchise\/\d+$/, async (route) => {
    expect(route.request().method()).toBe('DELETE');
    const franchiseId = Number(new URL(route.request().url()).pathname.split('/').pop());
    const franchiseIndex = franchises.findIndex((franchise) => franchise.id === franchiseId);
    if (franchiseIndex >= 0) franchises.splice(franchiseIndex, 1);
    await route.fulfill({ json: { message: 'franchise deleted' } });
  });
}

async function basicInit(page: Page) {
  await mockAuthApi(page, {
    users: {
      'd@jwt.com': {
        user: {
          id: '3',
          name: 'Kai Chen',
          email: 'd@jwt.com',
          roles: [{ role: Role.Diner }],
        },
        password: 'a',
        token: 'abcdef',
      },
    },
  });
  await mockMenuApi(page, [
    { id: 1, title: 'Veggie', image: 'pizza1.png', price: 0.0038, description: 'A garden of delight' },
    { id: 2, title: 'Pepperoni', image: 'pizza2.png', price: 0.0042, description: 'Spicy treat' },
  ]);
  await mockFranchiseListApi(page, () => ({
    franchises: [
      {
        id: 2,
        name: 'LotaPizza',
        stores: [
          { id: 4, name: 'Lehi' },
          { id: 5, name: 'Springville' },
          { id: 6, name: 'American Fork' },
        ],
      },
      { id: 3, name: 'PizzaCorp', stores: [{ id: 7, name: 'Spanish Fork' }] },
      { id: 4, name: 'topSpot', stores: [] },
    ],
    more: false,
  }));
  await mockOrderApi(page, {
    post: (orderReq) => ({ order: { ...orderReq, id: 23 }, jwt: 'eyJpYXQ' }),
  });
  await page.goto('/');
}

test('login', async ({ page }) => {
  await basicInit(page);
  await page.getByRole('link', { name: 'Login' }).click();
  await page.getByRole('textbox', { name: 'Email address' }).fill('d@jwt.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('a');
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page.getByRole('link', { name: 'KC' })).toBeVisible();
});

test('purchase with login', async ({ page }) => {
  await basicInit(page);
  await page.getByRole('button', { name: 'Order now' }).click();
  await expect(page.locator('h2')).toContainText('Awesome is a click away');
  await page.getByRole('combobox').selectOption('4');
  await page.getByRole('link', { name: 'Image Description Veggie A' }).click();
  await page.getByRole('link', { name: 'Image Description Pepperoni' }).click();
  await expect(page.locator('form')).toContainText('Selected pizzas: 2');
  await page.getByRole('button', { name: 'Checkout' }).click();

  await page.getByPlaceholder('Email address').fill('d@jwt.com');
  await page.getByPlaceholder('Password').fill('a');
  await page.getByRole('button', { name: 'Login' }).click();

  await expect(page.getByRole('main')).toContainText('Send me those 2 pizzas right now!');
  await expect(page.locator('tbody')).toContainText('Veggie');
  await expect(page.locator('tbody')).toContainText('Pepperoni');
  await expect(page.locator('tfoot')).toContainText('0.008 ₿');
  await page.getByRole('button', { name: 'Pay now' }).click();
  await expect(page.getByText('0.008')).toBeVisible();
});

test('register, order, verify the JWT, and view order history', async ({ page }) => {
  const email = `playwright-${Date.now()}@example.com`;
  const diner = {
    id: 3,
    name: 'Playwright Diner',
    email,
    roles: [{ role: Role.Diner }],
  };
  let createdOrder: any;

  await mockAuthApi(page, {
    registration: {
      request: { name: 'Playwright Diner', email, password: 'somepassword' },
      user: diner,
      token: 'diner-token',
    },
  });
  await mockMenuApi(page, [
    { id: 1, title: 'Veggie', image: 'pizza1.png', price: 0.0038, description: 'A garden of delight' },
    { id: 2, title: 'Margarita', image: 'pizza2.png', price: 0.0042, description: 'Classic cheese pizza' },
  ]);
  await mockFranchiseListApi(page, () => ({
    franchises: [{ id: 2, name: 'Test Franchise', stores: [{ id: 4, name: 'Lehi', totalRevenue: 0 }] }],
    more: false,
  }));
  await mockOrderApi(page, {
    post: (orderReq) => {
      expect(orderReq).toMatchObject({
        franchiseId: 2,
        storeId: '4',
        items: [
          { menuId: 1, description: 'Veggie', price: 0.0038 },
          { menuId: 2, description: 'Margarita', price: 0.0042 },
        ],
      });
      createdOrder = { ...orderReq, id: 23, date: '2026-09-23T12:00:00.000Z' };
      return { order: createdOrder, followLinkToEndChaos: 'mock-report-url', jwt: 'eyJpYXQ' };
    },
    get: () => {
      const historyOrder = {
        ...createdOrder,
        items: createdOrder.items.map((item: any, index: number) => ({ ...item, id: index + 1 })),
      };
      return { dinerId: diner.id, orders: [historyOrder], page: 1 };
    },
  });
  await mockOrderVerificationApi(page, 'eyJpYXQ', { message: 'valid', payload: 'verified JWT payload' });

  await page.goto('/');
  await page.getByRole('link', { name: 'Register' }).click();
  await page.getByRole('textbox', { name: 'Full name' }).fill('Playwright Diner');
  await page.getByRole('textbox', { name: 'Email address' }).fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill('somepassword');
  await page.getByRole('button', { name: 'Register' }).click();

  await page.getByRole('link', { name: 'Order' }).click();
  await page.getByRole('combobox').selectOption({ index: 1 });
  await page.getByRole('link', { name: /Image Description Veggie/ }).first().click();
  await page.getByRole('link', { name: /Image Description Margarita/ }).click();
  await page.getByRole('button', { name: 'Checkout' }).click();
  await page.getByRole('button', { name: 'Pay now' }).click();
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.locator('#hs-jwt-modal')).toHaveClass(/opened/);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('#hs-jwt-modal-backdrop')).toBeHidden();
  await page.getByRole('link', { name: 'PD', exact: true }).click();
  await page.getByRole('link', { name: 'Logout' }).click();
});

test('franchisee creates and closes one store', async ({ page }) => {
  const storeName = `playwright-store-${Date.now()}`;
  const franchisee: MockApiUser = {
    id: 4,
    name: 'Pizza Franchisee',
    email: 'f@jwt.com',
    roles: [{ role: Role.Franchisee, objectId: '4' }],
  };
  const franchise = {
    id: 4,
    name: 'Test Franchise',
    admins: [{ id: franchisee.id, name: franchisee.name, email: franchisee.email }],
    stores: [{ id: 1, name: 'Lehi', totalRevenue: 0 }],
  };
  await mockAuthApi(page, {
    users: {
      'f@jwt.com': { user: franchisee, password: 'franchisee', token: 'franchisee-token' },
    },
  });
  await mockFranchiseeStoreApi(page, franchisee, franchise);

  await page.goto('/');
  await page.getByRole('link', { name: 'Login' }).click();
  await page.getByRole('textbox', { name: 'Email address' }).fill('f@jwt.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('franchisee');
  await page.getByRole('button', { name: 'Login' }).click();
  await page.getByRole('navigation', { name: 'Global' }).getByRole('link', { name: 'Franchise' }).click();
  await page.getByRole('button', { name: 'Create store' }).click();
  await page.getByRole('textbox', { name: 'store name' }).fill(storeName);
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('row').filter({ hasText: storeName }).getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('link', { name: 'Logout' }).click();
});

test('admin creates, filters, and closes one franchise', async ({ page }) => {
  const franchiseName = `playwright-franchise-${Date.now()}`;
  const admin: MockApiUser = {
    id: 1,
    name: 'Pizza Admin',
    email: 'a@jwt.com',
    roles: [{ role: Role.Admin }],
  };
  const franchises = [
    {
      id: 1,
      name: 'Existing Franchise',
      admins: [{ id: 2, name: 'Pizza Franchisee', email: 'f@jwt.com' }],
      stores: [{ id: 1, name: 'Lehi', totalRevenue: 0 }],
    },
  ];
  const franchiseAdmin: MockApiUser = {
    id: 2,
    name: 'Pizza Franchisee',
    email: 'f@jwt.com',
    roles: [{ role: Role.Franchisee }],
  };

  await mockAuthApi(page, {
    users: {
      'a@jwt.com': { user: admin, password: 'admin', token: 'admin-token' },
    },
  });
  await mockAdminFranchiseApi(page, franchises, franchiseAdmin);

  await page.goto('/');
  await page.getByRole('link', { name: 'Login' }).click();
  await page.getByRole('textbox', { name: 'Email address' }).fill('a@jwt.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('admin');
  await page.getByRole('button', { name: 'Login' }).click();
  await page.getByRole('link', { name: 'Admin' }).click();
  await page.getByRole('button', { name: 'Add Franchise' }).click();
  await page.getByRole('textbox', { name: 'franchise name' }).fill(franchiseName);
  await page.getByRole('textbox', { name: 'franchisee admin email' }).fill('f@jwt.com');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('textbox', { name: 'Filter franchises' }).fill(franchiseName);
  await page.getByRole('button', { name: 'Submit' }).click();
  await page.getByRole('row').filter({ hasText: franchiseName }).getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('link', { name: 'Logout' }).click();
});
