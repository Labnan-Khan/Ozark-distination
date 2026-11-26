import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout.jsx';
import { ProtectedRoute } from './components/ProtectedRoute.jsx';
import { Home } from './pages/Home.jsx';
import { Login, Register } from './pages/Auth.jsx';
import { PropertyDetail } from './pages/PropertyDetail.jsx';
import { Bookings } from './pages/Bookings.jsx';
import { Favorites } from './pages/Favorites.jsx';
import { Notifications } from './pages/Notifications.jsx';
import { OwnerProperties } from './pages/OwnerProperties.jsx';
import { AdminProperties } from './pages/AdminProperties.jsx';
import { Profile } from './pages/Profile.jsx';
import { Forbidden, NotFound } from './pages/Simple.jsx';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="forbidden" element={<Forbidden />} />
        <Route path="properties/:id" element={<PropertyDetail />} />
        <Route path="bookings" element={<ProtectedRoute roles={['customer']}><Bookings mode="customer" /></ProtectedRoute>} />
        <Route path="favorites" element={<ProtectedRoute roles={['customer']}><Favorites /></ProtectedRoute>} />
        <Route path="notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
        <Route path="profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="owner/properties" element={<ProtectedRoute roles={['owner']}><OwnerProperties /></ProtectedRoute>} />
        <Route path="owner/bookings" element={<ProtectedRoute roles={['owner']}><Bookings mode="owner" /></ProtectedRoute>} />
        <Route path="admin/properties" element={<ProtectedRoute roles={['admin']}><AdminProperties /></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
