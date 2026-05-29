import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Initialize with specific multi_tenant sub database ID if specified, and force long polling for reliable sandbox execution
export const db = initializeFirestore(
  app,
  { experimentalForceLongPolling: true },
  (firebaseConfig as any).firestoreDatabaseId
);

export const auth = getAuth(app);

// Simple connection verify as required by skill guidelines
export async function testFirestoreConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log('Successfully connection-tested Firestore.');
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase connectivity configuration.');
    }
  }
}

testFirestoreConnection();
