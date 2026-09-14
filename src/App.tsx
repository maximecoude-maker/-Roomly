import { useEffect } from 'react';
import { matchPath, navigate, useHashPath } from './lib/router';
import { startSync } from './lib/sync';
import { InspectionProvider } from './store';
import { Button, DialogHost, EmptyState, ToastHost, TopBar } from './components/ui';
import { Home } from './screens/Home';
import { NewInspection } from './screens/NewInspection';
import { Overview } from './screens/Overview';
import { InfoScreen } from './screens/InfoScreen';
import { KeysScreen } from './screens/KeysScreen';
import { MetersScreen } from './screens/MetersScreen';
import { RoomScreen } from './screens/RoomScreen';
import { ItemScreen } from './screens/ItemScreen';
import { RecapScreen } from './screens/RecapScreen';
import { PdfScreen } from './screens/PdfScreen';

function InspectionRoutes({ path }: { path: string }) {
  const item = matchPath('/i/:id/r/:roomId/e/:itemId', path);
  if (item) return <ItemScreen roomId={item.roomId} itemId={item.itemId} />;
  const room = matchPath('/i/:id/r/:roomId', path);
  if (room) return <RoomScreen roomId={room.roomId} />;
  if (matchPath('/i/:id/info', path)) return <InfoScreen />;
  if (matchPath('/i/:id/keys', path)) return <KeysScreen />;
  if (matchPath('/i/:id/meters', path)) return <MetersScreen />;
  if (matchPath('/i/:id/recap', path)) return <RecapScreen />;
  if (matchPath('/i/:id/pdf', path)) return <PdfScreen />;
  return <Overview />;
}

function Router() {
  const path = useHashPath();
  if (path === '/new') return <NewInspection />;
  const inspectionId = path.startsWith('/i/') ? path.split('/')[2] : null;
  if (inspectionId) {
    return (
      <InspectionProvider
        id={inspectionId}
        fallback={(state) =>
          state === 'loading' ? (
            <div className="screen screen--center">
              <div className="spinner" />
            </div>
          ) : (
            <div className="screen">
              <TopBar title="Introuvable" back="/" />
              <main className="content">
                <EmptyState icon="alert" title="Cet état des lieux n’existe pas sur cet appareil">
                  <Button variant="primary" onClick={() => navigate('/', true)}>
                    Retour à l’accueil
                  </Button>
                </EmptyState>
              </main>
            </div>
          )
        }
      >
        <InspectionRoutes path={path} />
      </InspectionProvider>
    );
  }
  return <Home />;
}

export function App() {
  useEffect(() => startSync(), []);
  return (
    <>
      <Router />
      <DialogHost />
      <ToastHost />
    </>
  );
}
