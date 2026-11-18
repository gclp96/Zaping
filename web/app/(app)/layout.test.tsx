import {
  cleanup,
  render,
  screen,
  within,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/services/api';
import {
  clearAuthenticatedSessionCache,
  loadAuthenticatedSession,
} from '@/app/auth-session';
import { SIDEBAR_COLLAPSED_STORAGE_KEY } from '@/app/components/AppShell';

import AuthenticatedAppLayout from './layout';
import CategoriesPage from './categories/page';
import CustomersPage from './customers/page';
import DashboardPage from './dashboard/page';
import ProductsPage from './products/page';
import PurchasesPage from './purchases/page';
import SalesPage from './sales/page';
import ForgotPasswordPage from '../(public)/forgot-password/page';
import LoginPage from '../(public)/login/page';
import RegisterPage from '../(public)/register/page';
import PageContainer from '../components/ui/layout/PageContainer';
import PageHeader from '../components/ui/layout/PageHeader';

const navigationMock = vi.hoisted(() => ({
  pathname: '/dashboard',
}));

vi.mock('@/services/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => navigationMock.pathname,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

const dashboardData = {
  totals: {
    customers: 0,
    suppliers: 0,
    products: 0,
    quotes: 0,
    purchases: 0,
    sales: 0,
  },
  inventoryValue: 0,
  lowStockProducts: 0,
  lowStock: [],
};

function configureApiMocks() {
  vi.mocked(api.get).mockImplementation(async (url) => {
    const endpoint = String(url);

    if (endpoint === '/dashboard') {
      return {
        data: dashboardData,
      } as never;
    }

    if (endpoint === '/auth/me') {
      return {
        data: {
          id: 'user-1',
          companyId: 'company-1',
          email: 'admin@test.test',
          firstName: 'Admin',
          lastName: 'Test',
          role: 'ADMIN',
          companyTimezone: 'America/Hermosillo',
        },
      } as never;
    }

    return {
      data: [],
    } as never;
  });
}

function renderInShell(children: ReactNode) {
  return render(<AuthenticatedAppLayout>{children}</AuthenticatedAppLayout>);
}

describe('AuthenticatedAppLayout', () => {
  beforeEach(async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    clearAuthenticatedSessionCache();
    window.localStorage.clear();
    window.localStorage.setItem('token', 'test-token');
    navigationMock.pathname = '/dashboard';
    configureApiMocks();
    await loadAuthenticatedSession({ requireToken: true });
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    document.body.style.overflow = '';
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('renders the Sidebar', () => {
    const { container } = renderInShell(<div>Shell child</div>);

    expect(screen.getByText('Zaping ERP')).toBeTruthy();
    expect(screen.getByText('Clientes')).toBeTruthy();
    expect(
      container
        .querySelector('#desktop-navigation')
        ?.classList.contains('xl:flex'),
    ).toBe(true);
    expect(
      container
        .querySelector('#desktop-navigation')
        ?.classList.contains('lg:flex'),
    ).toBe(false);
  });

  it('renders the Header with the current route title', () => {
    renderInShell(<div>Shell child</div>);

    expect(
      within(screen.getByRole('banner')).getByText('Dashboard'),
    ).toBeTruthy();
    expect(
      screen.queryByRole('heading', {
        level: 1,
        name: 'Dashboard',
      }),
    ).toBeNull();
    expect(screen.queryByText('Leonardo')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Cuenta de Admin Test' }),
    ).toBeTruthy();

    const menuButton = screen.getByLabelText('Abrir navegación');
    expect(menuButton.getAttribute('aria-expanded')).toBe('false');
    expect(menuButton.getAttribute('aria-controls')).toBe(
      'mobile-navigation-drawer',
    );
  });

  it('renders children in the main content region', () => {
    renderInShell(<div>Shell child</div>);

    expect(screen.getByText('Shell child')).toBeTruthy();
  });

  it('renders Dashboard in the shared shell without a duplicate Sidebar', async () => {
    const { container } = renderInShell(<DashboardPage />);

    expect(
      await screen.findByText('Estado actual de tu operación.'),
    ).toBeTruthy();
    expect(container.querySelectorAll('aside')).toHaveLength(1);
    expect(screen.getAllByText('Zaping ERP')).toHaveLength(1);
    expect(container.querySelectorAll('main')).toHaveLength(1);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Resumen operativo',
      }),
    ).toBeTruthy();
  });

  it('keeps a single page heading while Dashboard is loading', () => {
    vi.mocked(api.get).mockImplementation(() => new Promise(() => undefined));

    const { container } = renderInShell(<DashboardPage />);

    expect(container.querySelectorAll('main')).toHaveLength(1);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Resumen operativo',
      }),
    ).toBeTruthy();
  });

  it('keeps PageHeader as the single page heading inside the shell', () => {
    const { container } = renderInShell(
      <PageContainer>
        <PageHeader title="Página de prueba" />
      </PageContainer>,
    );

    expect(container.querySelectorAll('main')).toHaveLength(1);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Página de prueba',
      }),
    ).toBeTruthy();
  });

  it('preserves the Categories page heading exception', async () => {
    navigationMock.pathname = '/categories';

    const { container } = renderInShell(<CategoriesPage />);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/categories');
    });

    expect(container.querySelectorAll('main')).toHaveLength(1);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Categorías',
      }),
    ).toBeTruthy();
  });

  it('renders all approved existing navigation groups', () => {
    renderInShell(<div>Shell child</div>);

    expect(screen.getByText('GENERAL')).toBeTruthy();
    expect(screen.getByText('VENTAS')).toBeTruthy();
    expect(screen.getByText('COMPRAS')).toBeTruthy();
    expect(screen.getByText('INVENTARIO')).toBeTruthy();
    expect(screen.getByText('ADMINISTRACIÓN')).toBeTruthy();
  });

  it('renders approved navigation links for existing routes', () => {
    renderInShell(<div>Shell child</div>);

    expect(
      screen.getByRole('link', { name: 'Inicio' }).getAttribute('href'),
    ).toBe('/home');
    expect(
      screen.getByRole('link', { name: 'Dashboard' }).getAttribute('href'),
    ).toBe('/dashboard');
    expect(
      screen.getByRole('link', { name: 'Clientes' }).getAttribute('href'),
    ).toBe('/customers');
    expect(
      screen.getByRole('link', { name: 'Cotizaciones' }).getAttribute('href'),
    ).toBe('/quotes');
    expect(
      screen.getByRole('link', { name: 'Ventas' }).getAttribute('href'),
    ).toBe('/sales');
    expect(
      screen.getByRole('link', { name: 'Proveedores' }).getAttribute('href'),
    ).toBe('/suppliers');
    expect(
      screen.getByRole('link', { name: 'Órdenes de compra' }).getAttribute('href'),
    ).toBe('/purchases');
    expect(
      screen.getByRole('link', { name: 'Recepciones' }).getAttribute('href'),
    ).toBe('/purchase-receipts');
    expect(
      screen.getByRole('link', { name: 'Productos' }).getAttribute('href'),
    ).toBe('/products');
    expect(
      screen.getByRole('link', { name: 'Inventario' }).getAttribute('href'),
    ).toBe('/inventory');
    expect(
      screen.getByRole('link', { name: 'Equipos' }).getAttribute('href'),
    ).toBe('/equipment');
    expect(
      screen.getByRole('link', { name: 'Categorías' }).getAttribute('href'),
    ).toBe('/categories');
  });

  it('does not render navigation links for missing routes', () => {
    renderInShell(<div>Shell child</div>);

    expect(screen.queryByRole('link', { name: 'Sales' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Equipment' })).toBeNull();
  });

  it('renders Equipos after Inventario in the INVENTARIO group', () => {
    renderInShell(<div>Shell child</div>);

    const inventoryGroup = screen.getByText('INVENTARIO').parentElement;
    expect(inventoryGroup).toBeTruthy();
    expect(
      within(inventoryGroup as HTMLElement)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Productos', 'Categorías', 'Inventario', 'Equipos']);
  });

  it('renders Inicio before Dashboard in the INICIO group', () => {
    renderInShell(<div>Shell child</div>);

    const startGroup = screen.getByText('GENERAL').parentElement;
    expect(startGroup).toBeTruthy();
    expect(
      within(startGroup as HTMLElement)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Inicio', 'Dashboard']);
  });

  it('renders Recepciones after Compras in the COMPRAS group', () => {
    renderInShell(<div>Shell child</div>);

    const purchasesGroup = screen.getByText('COMPRAS').parentElement;
    expect(purchasesGroup).toBeTruthy();
    expect(
      within(purchasesGroup as HTMLElement)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Proveedores', 'Órdenes de compra', 'Recepciones', 'Documentos de proveedor']);
  });

  it('marks Dashboard active for the Dashboard route', () => {
    navigationMock.pathname = '/dashboard';

    renderInShell(<div>Shell child</div>);

    expect(
      screen
        .getByRole('link', { name: 'Dashboard' })
        .getAttribute('aria-current'),
    ).toBe('page');
  });

  it('marks Home active for the Home route', () => {
    navigationMock.pathname = '/home';

    renderInShell(<div>Shell child</div>);

    expect(
      screen.getByRole('link', { name: 'Inicio' }).getAttribute('aria-current'),
    ).toBe('page');
  });

  it('marks Products active for the Products route', () => {
    navigationMock.pathname = '/products';

    renderInShell(<div>Shell child</div>);

    expect(
      screen
        .getByRole('link', { name: 'Productos' })
        .getAttribute('aria-current'),
    ).toBe('page');
  });

  it('marks Equipment active for the Equipment route', () => {
    navigationMock.pathname = '/equipment';

    renderInShell(<div>Shell child</div>);

    expect(
      screen
        .getByRole('link', { name: 'Equipos' })
        .getAttribute('aria-current'),
    ).toBe('page');
  });

  it('marks Purchases active for nested Purchase routes', () => {
    navigationMock.pathname = '/purchases/123';

    renderInShell(<div>Shell child</div>);

    expect(
      screen
        .getByRole('link', { name: 'Órdenes de compra' })
        .getAttribute('aria-current'),
    ).toBe('page');
  });

  it('marks Recepciones active for nested Receipt routes', () => {
    navigationMock.pathname = '/purchase-receipts/receipt-1';

    renderInShell(<div>Shell child</div>);

    expect(
      screen
        .getByRole('link', { name: 'Recepciones' })
        .getAttribute('aria-current'),
    ).toBe('page');
  });

  it('marks Sales active for the Sales route', () => {
    navigationMock.pathname = '/sales';

    renderInShell(<div>Shell child</div>);

    expect(
      screen.getByRole('link', { name: 'Ventas' }).getAttribute('aria-current'),
    ).toBe('page');
  });

  it('marks Sales active for nested Sales routes', () => {
    navigationMock.pathname = '/sales/sale-1';

    renderInShell(<div>Shell child</div>);

    expect(
      screen.getByRole('link', { name: 'Ventas' }).getAttribute('aria-current'),
    ).toBe('page');
  });

  it('does not mark unrelated routes active', () => {
    navigationMock.pathname = '/products';

    renderInShell(<div>Shell child</div>);

    expect(
      screen
        .getByRole('link', { name: 'Órdenes de compra' })
        .getAttribute('aria-current'),
    ).toBeNull();
  });

  it('does not activate navigation entries for root route matching', () => {
    navigationMock.pathname = '/';

    renderInShell(<div>Shell child</div>);

    const activeLinks = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page');

    expect(activeLinks).toHaveLength(0);
  });

  it.each([
    ['/home', 'Inicio'],
    ['/dashboard', 'Dashboard'],
    ['/products', 'Productos'],
    ['/purchases', 'Órdenes de compra'],
    ['/purchase-receipts/receipt-1', 'Recepciones'],
    ['/quotes', 'Cotizaciones'],
    ['/sales', 'Ventas'],
    ['/equipment', 'Equipos'],
  ])('renders %s with the correct Header title', (pathname, title) => {
    navigationMock.pathname = pathname;

    renderInShell(<div>Shell child</div>);

    expect(within(screen.getByRole('banner')).getByText(title)).toBeTruthy();
    expect(
      screen.queryByRole('heading', {
        level: 1,
        name: title,
      }),
    ).toBeNull();
  });

  it('renders Products under the authenticated shell', async () => {
    navigationMock.pathname = '/products';

    renderInShell(<ProductsPage />);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/products');
    });

    expect(screen.getByText('Zaping ERP')).toBeTruthy();
    expect(
      screen.getByText('Administra el catálogo de productos.'),
    ).toBeTruthy();
  });

  it('renders Customers under the authenticated shell', async () => {
    navigationMock.pathname = '/customers';

    renderInShell(<CustomersPage />);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/customers');
    });

    expect(screen.getByText('Zaping ERP')).toBeTruthy();
    expect(
      screen.getByText(
        'Administra los clientes disponibles para nuevas operaciones.',
      ),
    ).toBeTruthy();
  });

  it('renders Purchases under the authenticated shell', async () => {
    navigationMock.pathname = '/purchases';

    renderInShell(<PurchasesPage />);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/purchases');
    });

    expect(screen.getByText('Zaping ERP')).toBeTruthy();
    expect(
      screen.getByText('Administra órdenes de compra y da seguimiento a sus recepciones.'),
    ).toBeTruthy();
  });

  it('renders Sales under the authenticated shell', async () => {
    navigationMock.pathname = '/sales';

    renderInShell(<SalesPage />);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/sales');
    });

    expect(screen.getByText('Zaping ERP')).toBeTruthy();
    expect(
      screen.getByText('Consulta y da seguimiento a las ventas registradas.'),
    ).toBeTruthy();
  });

  it('does not render the authenticated shell for Login', () => {
    render(<LoginPage />);

    expect(screen.queryByText('Zaping ERP')).toBeNull();
    expect(screen.queryByText('Leonardo')).toBeNull();
    expect(screen.queryByLabelText('Abrir navegación')).toBeNull();
  });

  it('does not render the authenticated shell for Register', () => {
    render(<RegisterPage />);

    expect(screen.queryByText('Zaping ERP')).toBeNull();
    expect(screen.queryByText('Leonardo')).toBeNull();
    expect(screen.queryByLabelText('Abrir navegación')).toBeNull();
  });

  it('does not render the authenticated shell for Forgot Password', () => {
    render(<ForgotPasswordPage />);

    expect(screen.queryByText('Zaping ERP')).toBeNull();
    expect(screen.queryByText('Leonardo')).toBeNull();
    expect(screen.queryByLabelText('Abrir navegación')).toBeNull();
  });

  it('renders a mobile menu control', () => {
    renderInShell(<div>Shell child</div>);

    expect(screen.getByLabelText('Abrir navegación')).toBeTruthy();
  });

  it('persists desktop Sidebar collapse and expand commands', async () => {
    const user = userEvent.setup();

    renderInShell(<div>Shell child</div>);

    await user.click(
      screen.getByRole('button', { name: 'Colapsar navegación' }),
    );

    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe(
      'true',
    );
    expect(
      screen.getByRole('button', { name: 'Expandir navegación' }),
    ).toBeTruthy();

    await user.click(
      screen.getByRole('button', { name: 'Expandir navegación' }),
    );

    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe(
      'false',
    );
  });

  it('restores a persisted collapsed Sidebar after hydration', async () => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, 'true');

    renderInShell(<div>Shell child</div>);

    expect(
      await screen.findByRole('button', {
        name: 'Expandir navegación',
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Productos' }).getAttribute('title'),
    ).toBe('Productos');
  });

  it('opens and closes the mobile navigation drawer', async () => {
    const user = userEvent.setup();

    renderInShell(<div>Shell child</div>);

    await user.click(screen.getByLabelText('Abrir navegación'));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(dialog.classList.contains('xl:hidden')).toBe(true);
    expect(dialog.classList.contains('lg:hidden')).toBe(false);
    expect(
      screen.getByLabelText('Abrir navegación').getAttribute('aria-expanded'),
    ).toBe('true');

    const closeButtons = screen.getAllByLabelText('Cerrar navegación');
    await user.click(closeButtons[closeButtons.length - 1]);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes the drawer through its backdrop', async () => {
    const user = userEvent.setup();

    renderInShell(<div>Shell child</div>);

    await user.click(screen.getByLabelText('Abrir navegación'));
    await user.click(screen.getByTestId('navigation-backdrop'));

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes the drawer with Escape', async () => {
    const user = userEvent.setup();

    renderInShell(<div>Shell child</div>);

    await user.click(screen.getByLabelText('Abrir navegación'));
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('locks body scroll and restores focus after closing the drawer', async () => {
    const user = userEvent.setup();

    renderInShell(<div>Shell child</div>);

    const menuButton = screen.getByLabelText('Abrir navegación');
    await user.click(menuButton);

    const dialog = screen.getByRole('dialog');
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.activeElement).toBe(dialog);

    await user.click(screen.getByTestId('navigation-backdrop'));

    expect(document.body.style.overflow).toBe('');
    expect(document.activeElement).toBe(menuButton);
  });

  it('closes the mobile navigation drawer after selecting a link', async () => {
    const user = userEvent.setup();

    renderInShell(<div>Shell child</div>);

    await user.click(screen.getByLabelText('Abrir navegación'));

    const drawer = screen.getByRole('dialog');

    const productsLink = within(drawer).getByRole('link', {
      name: 'Productos',
    });

    productsLink.addEventListener('click', (event) => {
      event.preventDefault();
    });

    await user.click(productsLink);

    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
