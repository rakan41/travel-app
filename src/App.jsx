import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, signInAnonymously, onAuthStateChanged, 
  GoogleAuthProvider, signInWithPopup, createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, signOut 
} from 'firebase/auth';
import { 
  getFirestore, collection, doc, setDoc, updateDoc, deleteDoc, 
  onSnapshot, getDoc, enableIndexedDbPersistence
} from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { 
  Calendar as CalendarIcon, List, Wallet, Plus, Plane, Bed, MapPin, 
  Train, Car, Bus, Ship, Navigation, Building, Home, Users, Trash2, 
  X, ChevronLeft, ChevronRight, Clock, Globe2, CalendarDays, ExternalLink, 
  Link as LinkIcon, Share2, UserPlus, AlertCircle, Edit2, LogOut, CheckSquare, 
  Printer, Lightbulb, Utensils, Wine, Landmark, Ticket,
  Paperclip, UploadCloud, Loader2, Coffee, Copy
} from 'lucide-react';

const firebaseConfig = {
  apiKey: "AIzaSyC_rlEwDTift8WgQnLuaGjOgbejgXTQm1E",
  authDomain: "my-travel-app-cffa9.firebaseapp.com",
  projectId: "my-travel-app-cffa9",
  storageBucket: "my-travel-app-cffa9.firebasestorage.app",
  messagingSenderId: "1005580922425",
  appId: "1:1005580922425:web:941f91582aa760613467e8",
  measurementId: "G-80M29NWWCC"
};

let app, auth, db, storage;
try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
  
  // Enable offline mode
  enableIndexedDbPersistence(db).catch((err) => {
    console.warn("Offline persistence notice:", err.code);
  });
} catch (e) {
  console.error("Firebase init error:", e);
}

const appId = 'rakan-awesome-travel-app'; 

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};
const formatShortDate = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
const formatCurrency = (amount, currency) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency }).format(amount);
};
const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

const CATEGORIES = {
  transport: { label: 'Transport', color: 'text-blue-600', bg: 'bg-blue-100', border: 'border-blue-200' },
  accommodation: { label: 'Accommodation', color: 'text-indigo-600', bg: 'bg-indigo-100', border: 'border-indigo-200' },
  activity: { label: 'Activity', color: 'text-emerald-600', bg: 'bg-emerald-100', border: 'border-emerald-200' },
  recommendation: { label: 'Ideas', color: 'text-amber-600', bg: 'bg-amber-100', border: 'border-amber-200' }
};

const SUB_TYPES = {
  transport: {
    flight: { icon: Plane, label: 'Flight' },
    train: { icon: Train, label: 'Train' },
    bus: { icon: Bus, label: 'Bus' },
    ferry: { icon: Ship, label: 'Ferry' },
    transfer: { icon: Car, label: 'Private Transfer' },
    other: { icon: Navigation, label: 'Other Transport' }
  },
  accommodation: {
    hotel: { icon: Building, label: 'Hotel' },
    airbnb: { icon: Home, label: 'Airbnb / Rental' },
    friend: { icon: Users, label: 'Friend\'s Place' },
    other: { icon: Bed, label: 'Other Accommodation' }
  },
  activity: {
    tour: { icon: MapPin, label: 'Tour' },
    dining: { icon: Utensils, label: 'Dining' },
    event: { icon: Ticket, label: 'Event / Show' },
    other: { icon: CalendarIcon, label: 'Other Activity' }
  },
  recommendation: {
    place: { icon: MapPin, label: 'Place to Visit' },
    eatery: { icon: Utensils, label: 'Eateries' },
    cafe: { icon: Coffee, label: 'Cafes / Coffee' },
    bar: { icon: Wine, label: 'Bars/Clubs' },
    museum: { icon: Landmark, label: 'Museums' },
    activity: { icon: Ticket, label: 'Activities' },
    other: { icon: Lightbulb, label: 'Other Ideas' }
  }
};

const currencies = ['AUD', 'USD', 'EUR', 'GBP', 'CAD', 'JPY']; 

export default function App() {
  const [user, setUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [trips, setTrips] = useState([]);
  const [activeTripId, setActiveTripId] = useState(null); 
  const [activeTab, setActiveTab] = useState('calendar'); 
  const [selectedDate, setSelectedDate] = useState('');
  
  // Modals & Editing
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAddTripModalOpen, setIsAddTripModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: null });

  // Auth Listener
  useEffect(() => {
    if (!auth) {
      setIsAuthLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Fetch Trips
  useEffect(() => {
    if (!user || !db) return;
    const tripsRef = collection(db, 'artifacts', appId, 'public', 'data', 'trips');
    const unsubscribe = onSnapshot(tripsRef, (snapshot) => {
      const allTrips = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      const myTrips = allTrips.filter(t => t.ownerId === user.uid || (t.sharedWith && t.sharedWith.includes(user.uid)));
      setTrips(myTrips);
    }, (err) => console.error("Firestore error:", err));
    return () => unsubscribe();
  }, [user]);

  // Auto-Join from URL Link
  useEffect(() => {
    const processUrlJoin = async () => {
      if (!user || !db) return;
      const params = new URLSearchParams(window.location.search);
      const joinId = params.get('join');
      
      if (joinId) {
        try {
          const tripRef = doc(db, 'artifacts', appId, 'public', 'data', 'trips', joinId);
          const snap = await getDoc(tripRef);
          if (snap.exists()) {
            const data = snap.data();
            // Add user to shared list if they aren't the owner and aren't already in the list
            if (data.ownerId !== user.uid && (!data.sharedWith || !data.sharedWith.includes(user.uid))) {
              await updateDoc(tripRef, { sharedWith: [...(data.sharedWith || []), user.uid] });
            }
            // Open the trip immediately
            setActiveTripId(joinId);
            setSelectedDate(data.startDate);
            setActiveTab('calendar');
          }
        } catch (e) {
          console.error("Error auto-joining:", e);
        }
        // Clean up the URL so refreshing the page doesn't run this again
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    };
    
    processUrlJoin();
  }, [user, db]);

  const activeTrip = trips.find(t => t.id === activeTripId);

  const ownedTrips = trips.filter(t => t.ownerId === user?.uid);
  const sharedTrips = trips.filter(t => t.ownerId !== user?.uid);

  // Bulletproof filter for chronological sorting
  const itemsForSelectedDate = useMemo(() => {
    if (!activeTrip || !selectedDate) return [];
    return activeTrip.items
      .filter(item => {
        if (item.category === 'recommendation') return false; 
        
        const start = item.date;
        const end = (item.endDate && item.endDate.trim() !== '') ? item.endDate : item.date;
        
        return selectedDate >= start && selectedDate <= end;
      })
      .sort((a, b) => {
        const getSortTime = (item, date) => {
           const start = item.date;
           const end = (item.endDate && item.endDate.trim() !== '') ? item.endDate : item.date;
           if (start === date) return item.time || '00:00';
           if (end === date && start !== end) return item.endTime || '23:59';
           return '00:00'; // Carry-overs pin to the top of the day
        };
        
        const timeA = getSortTime(a, selectedDate);
        const timeB = getSortTime(b, selectedDate);
        if (timeA !== timeB) return timeA.localeCompare(timeB);
        return a.category.localeCompare(b.category);
      });
  }, [activeTrip, selectedDate]);

  // Determine current cities to show relevant Ideas across days
  const currentCities = useMemo(() => {
    if (!activeTrip || !selectedDate) return [];
    let cities = new Set();
    
    // 1. Accommodations spanning over this date
    activeTrip.items.forEach(i => {
      if (i.category === 'accommodation' && i.city) {
        const start = i.date;
        const end = (i.endDate && i.endDate.trim() !== '') ? i.endDate : i.date;
        if (selectedDate >= start && selectedDate <= end) {
          cities.add(i.city.trim().toLowerCase());
        }
      }
    });

    // 2. Activities on this date
    activeTrip.items.forEach(i => {
      if (i.category === 'activity' && i.city && i.date === selectedDate) {
        cities.add(i.city.trim().toLowerCase());
      }
    });

    // 3. Transport arriving before or on this date
    const pastTransports = activeTrip.items
      .filter(i => i.category === 'transport' && i.arrCity)
      .filter(i => {
         const d = (i.endDate && i.endDate.trim() !== '') ? i.endDate : i.date;
         return d <= selectedDate;
      })
      .sort((a,b) => {
        const aDate = (a.endDate && a.endDate.trim() !== '') ? a.endDate : a.date;
        const bDate = (b.endDate && b.endDate.trim() !== '') ? b.endDate : b.date;
        return aDate.localeCompare(bDate);
      });
    
    // Only fall back to previous flight if we don't have an active hotel or event today
    if (cities.size === 0 && pastTransports.length > 0) {
      cities.add(pastTransports[pastTransports.length - 1].arrCity.trim().toLowerCase());
    }

    // 4. Transport departing on this date
    activeTrip.items.forEach(i => {
      if (i.category === 'transport' && i.depCity && i.date === selectedDate) {
        cities.add(i.depCity.trim().toLowerCase());
      }
    });

    return Array.from(cities);
  }, [activeTrip, selectedDate]);

  const defaultLocationInfo = useMemo(() => {
    if (!activeTrip || currentCities.length === 0) return { city: '', country: '' };
    const targetCity = currentCities[0]; 
    
    let foundCity = targetCity;
    let foundCountry = '';

    // Search past items to find the original casing and country attached to this city
    for (const i of activeTrip.items) {
      if (i.category === 'accommodation' && i.city && i.city.trim().toLowerCase() === targetCity) {
        foundCity = i.city; foundCountry = i.country || ''; break;
      }
      if (i.category === 'transport' && i.arrCity && i.arrCity.trim().toLowerCase() === targetCity) {
        foundCity = i.arrCity; foundCountry = i.arrCountry || ''; break;
      }
    }
    
    const formattedCity = foundCity.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    return { city: formattedCity, country: foundCountry };
  }, [activeTrip, currentCities]);

  // Filter recommendations based on current cities
  const recommendationsForToday = useMemo(() => {
    if (!activeTrip) return [];
    const ideas = activeTrip.items.filter(i => i.category === 'recommendation');
    
    if (currentCities.length === 0) {
      return ideas; // Fallback: Show all ideas safely if we don't know where the user is
    }

    return ideas.filter(idea => {
      if (!idea.city) return true;
      const ideaCity = idea.city.trim().toLowerCase();
      // Loose matching allows "Tokyo" to match "Tokyo, Japan"
      return currentCities.some(cc => cc.includes(ideaCity) || ideaCity.includes(cc));
    });
  }, [activeTrip, currentCities]);

  const budgetSummary = useMemo(() => {
    if (!activeTrip) return {};
    const summary = {};
    activeTrip.items.forEach(item => {
      if (!item.cost || isNaN(item.cost)) return;
      if (!summary[item.currency]) summary[item.currency] = { total: 0, paid: 0, unpaid: 0 };
      const cost = parseFloat(item.cost);
      summary[item.currency].total += cost;
      if (item.isPaid) summary[item.currency].paid += cost;
      else summary[item.currency].unpaid += cost;
    });
    return summary;
  }, [activeTrip]);

  const handleSaveTrip = async (tripData) => {
    if (!user) return;
    try {
      if (editingTrip) {
        const tripRef = doc(db, 'artifacts', appId, 'public', 'data', 'trips', editingTrip.id);
        await updateDoc(tripRef, { name: tripData.name, startDate: tripData.startDate, endDate: tripData.endDate });
        setEditingTrip(null);
      } else {
        const trip = { ...tripData, ownerId: user.uid, sharedWith: [], items: [], checklist: [] };
        await setDoc(doc(collection(db, 'artifacts', appId, 'public', 'data', 'trips')), trip);
      }
      setIsAddTripModalOpen(false);
    } catch (e) { setConfirmModal({ isOpen: true, title: "Error", message: e.message, isAlert: true }); }
  };

  const requestDeleteTrip = (id, e) => {
    e.stopPropagation();
    const trip = trips.find(t => t.id === id);
    const isOwner = trip.ownerId === user.uid;
    
    setConfirmModal({
      isOpen: true,
      title: isOwner ? "Delete Trip?" : "Leave Trip?",
      message: isOwner ? "Are you sure you want to delete this trip entirely? This affects everyone sharing it." : "Are you sure you want to remove this shared trip from your dashboard?",
      onConfirm: async () => {
        if (isOwner) {
          await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'trips', id));
        } else {
          const newSharedWith = trip.sharedWith.filter(uid => uid !== user.uid);
          await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'trips', id), { sharedWith: newSharedWith });
        }
        if (activeTripId === id) setActiveTripId(null);
        setConfirmModal({ isOpen: false });
      }
    });
  };

  const requestDuplicateTrip = (id, e) => {
    e.stopPropagation();
    const tripToCopy = trips.find(t => t.id === id);
    if (!tripToCopy || !user) return;
    
    setConfirmModal({
      isOpen: true,
      title: "Duplicate Trip?",
      message: `Create a copy of "${tripToCopy.name}"?`,
      onConfirm: async () => {
        // Generate new unique IDs for all nested items to prevent data collisions
        const newItems = (tripToCopy.items || []).map(item => ({
          ...item,
          id: Date.now().toString() + Math.random().toString(36).substring(2, 9)
        }));
        const newChecklist = (tripToCopy.checklist || []).map(item => ({
          ...item,
          id: Date.now().toString() + Math.random().toString(36).substring(2, 9)
        }));

        const newTrip = {
          ...tripToCopy,
          name: `Copy of ${tripToCopy.name}`,
          ownerId: user.uid,
          sharedWith: [], // Remove guest access so the copy is private
          items: newItems,
          checklist: newChecklist
        };
        delete newTrip.id; // Ensure we don't accidentally write the old ID into the new document

        await setDoc(doc(collection(db, 'artifacts', appId, 'public', 'data', 'trips')), newTrip);
        setConfirmModal({ isOpen: false });
      }
    });
  };

  const handleJoinTrip = async (tripIdToJoin) => {
    if (!user) return { success: false, message: "Not logged in" };
    try {
      const tripRef = doc(db, 'artifacts', appId, 'public', 'data', 'trips', tripIdToJoin);
      const snap = await getDoc(tripRef);
      if (snap.exists()) {
        const data = snap.data();
        if (data.ownerId === user.uid || data.sharedWith.includes(user.uid)) return { success: true, message: "You already have access to this trip." };
        await updateDoc(tripRef, { sharedWith: [...data.sharedWith, user.uid] });
        return { success: true, message: "Successfully joined trip!" };
      }
      return { success: false, message: "Trip not found. Check the ID." };
    } catch (e) { return { success: false, message: "Error joining trip." }; }
  };

  const handleSaveItem = async (itemData) => {
    if (!activeTrip) return;
    let newItems;
    if (editingItem) {
      newItems = activeTrip.items.map(i => i.id === editingItem.id ? { ...itemData, id: editingItem.id } : i);
      setEditingItem(null);
    } else {
      newItems = [...activeTrip.items, { ...itemData, id: Date.now().toString(), isCompleted: false }];
    }
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'trips', activeTripId), { items: newItems });
    setIsAddModalOpen(false);
    if (itemData.date && itemData.category !== 'recommendation') {
      setSelectedDate(itemData.date);
      setActiveTab('day');
    }
  };

  const requestDeleteItem = (itemId) => {
    setConfirmModal({
      isOpen: true,
      title: "Delete Item?",
      message: "Are you sure you want to remove this item?",
      onConfirm: async () => {
        const newItems = activeTrip.items.filter(item => item.id !== itemId);
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'trips', activeTripId), { items: newItems });
        setConfirmModal({ isOpen: false });
      }
    });
  };

  const handleToggleIdea = async (itemId, currentStatus) => {
    const newItems = activeTrip.items.map(item => item.id === itemId ? { ...item, isCompleted: !currentStatus } : item);
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'trips', activeTripId), { items: newItems });
  };

  if (isAuthLoading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500 font-medium">Loading your travels...</div>;
  if (!user) return <AuthScreen auth={auth} />;

  return (
    <div className="min-h-screen bg-slate-100 flex justify-center font-sans text-slate-800">
      <div className="w-full max-w-xl bg-white shadow-2xl flex flex-col relative overflow-hidden sm:border-x sm:border-slate-200">
        
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 pt-12 pb-6 rounded-b-3xl shadow-md z-10 transition-all duration-300">
          {!activeTrip ? (
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                  <Globe2 className="text-blue-400" /> My Trips
                </h1>
                <div className="flex items-center gap-2 mt-1.5">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="User profile" className="w-5 h-5 rounded-full border border-slate-700" />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-400">
                      {user.email ? user.email.charAt(0).toUpperCase() : 'G'}
                    </div>
                  )}
                  <p className="text-slate-400 text-sm truncate max-w-[160px]" title={user.email}>
                    {user.displayName || user.email || 'Guest Traveler'}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setIsJoinModalOpen(true)} className="flex items-center gap-1 text-xs font-semibold bg-slate-800 px-3 py-1.5 rounded-full hover:bg-slate-700 transition-colors">
                  <UserPlus size={14} /> Join
                </button>
                <button onClick={() => signOut(auth)} className="flex items-center gap-1 text-xs font-semibold bg-red-900/40 text-red-200 px-3 py-1.5 rounded-full hover:bg-red-900/60 transition-colors">
                  <LogOut size={14} />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex justify-between items-start">
              <div className="flex items-start gap-3">
                <button onClick={() => setActiveTripId(null)} className="p-2 -ml-2 bg-slate-800 hover:bg-slate-700 rounded-full transition-colors text-white mt-0.5">
                  <ChevronLeft size={20} />
                </button>
                <div>
                  <h1 className="text-xl font-bold tracking-tight leading-tight max-w-[200px]">{activeTrip.name}</h1>
                  <p className="text-slate-400 text-sm mt-1 flex items-center gap-1">
                    <CalendarIcon size={12} />
                    {formatDate(activeTrip.startDate)} - {formatDate(activeTrip.endDate)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => window.print()} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-full transition-colors text-white" title="Print/Export Itinerary">
                  <Printer size={16} />
                </button>
                <button onClick={() => { setEditingTrip(activeTrip); setIsAddTripModalOpen(true); }} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-full transition-colors text-white" title="Edit Trip">
                  <Edit2 size={16} />
                </button>
                <button onClick={() => setIsShareModalOpen(true)} className="p-2 bg-blue-600/20 text-blue-400 hover:bg-blue-600/40 rounded-full transition-colors" title="Share Trip">
                  <Share2 size={16} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto pb-24 relative print:overflow-visible print:pb-0">
          {!activeTrip && (
            <div className="p-6 space-y-8 animate-in fade-in duration-300">
              {trips.length === 0 ? (
                <div className="text-center py-12 px-4 text-slate-500">
                  <Globe2 size={48} className="mx-auto text-slate-300 mb-4" />
                  <p className="font-medium text-slate-700 text-lg">No trips planned yet</p>
                  <p className="text-sm mt-1">Create or join a trip to get started.</p>
                </div>
              ) : (
                <>
                  {ownedTrips.length > 0 && (
                    <div className="space-y-4">
                      <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                        <CalendarIcon size={16} /> Created by Me
                      </h2>
                      {ownedTrips.map(trip => (
                        <div key={trip.id} onClick={() => { setActiveTripId(trip.id); setSelectedDate(trip.startDate); setActiveTab('calendar'); }} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all cursor-pointer group relative">
                          <div className="absolute top-3 right-3 flex items-center gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100">
                            <button onClick={(e) => requestDuplicateTrip(trip.id, e)} className="p-1.5 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-md transition-colors" title="Duplicate Trip">
                              <Copy size={16} />
                            </button>
                            <button onClick={(e) => requestDeleteTrip(trip.id, e)} className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors" title="Delete Trip">
                              <Trash2 size={16} />
                            </button>
                          </div>
                          <div className="pr-16">
                            <h3 className="text-lg font-bold truncate">{trip.name}</h3>
                            <div className="flex items-center gap-4 mt-3 text-sm text-slate-500">
                              <div className="flex items-center gap-1.5"><CalendarDays size={16} className="text-blue-500" /><span>{formatDate(trip.startDate)}</span></div>
                            </div>
                            {trip.sharedWith && trip.sharedWith.length > 0 && (
                              <div className="mt-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 w-fit px-2 py-1 rounded-md">
                                <Users size={14} /> Shared with {trip.sharedWith.length} {trip.sharedWith.length === 1 ? 'person' : 'people'}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {sharedTrips.length > 0 && (
                    <div className="space-y-4">
                      <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                        <Users size={16} /> Shared With Me
                      </h2>
                      {sharedTrips.map(trip => (
                        <div key={trip.id} onClick={() => { setActiveTripId(trip.id); setSelectedDate(trip.startDate); setActiveTab('calendar'); }} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all cursor-pointer group relative">
                          <div className="absolute top-3 right-3 flex items-center gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100">
                            <button onClick={(e) => requestDuplicateTrip(trip.id, e)} className="p-1.5 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-md transition-colors" title="Duplicate Trip">
                              <Copy size={16} />
                            </button>
                            <button onClick={(e) => requestDeleteTrip(trip.id, e)} className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors" title="Leave Trip">
                              <LogOut size={16} />
                            </button>
                          </div>
                          <div className="pr-16">
                            <h3 className="text-lg font-bold truncate">{trip.name}</h3>
                            <div className="flex items-center gap-4 mt-3 text-sm text-slate-500">
                              <div className="flex items-center gap-1.5"><CalendarDays size={16} className="text-amber-500" /><span>{formatDate(trip.startDate)}</span></div>
                            </div>
                            <div className="mt-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-100 w-fit px-2 py-1 rounded-md">
                              <UserPlus size={14} /> Guest Access
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTrip && (
            <>
              {activeTab === 'calendar' && <CalendarView trip={activeTrip} onSelectDate={(date) => { setSelectedDate(date); setActiveTab('day'); }} />}
              {activeTab === 'day' && (
                <DayView 
                  date={selectedDate} 
                  items={itemsForSelectedDate} 
                  currentCities={currentCities}
                  recommendations={recommendationsForToday}
                  onDelete={requestDeleteItem}
                  onToggleIdea={handleToggleIdea}
                  onEdit={(item) => { setEditingItem(item); setIsAddModalOpen(true); }}
                  tripStart={activeTrip.startDate}
                  tripEnd={activeTrip.endDate}
                  onDateChange={setSelectedDate}
                />
              )}
              {activeTab === 'checklist' && <ChecklistView trip={activeTrip} db={db} appId={appId} />}
              {activeTab === 'budget' && <BudgetView summary={budgetSummary} items={activeTrip.items} />}
            </>
          )}
        </div>

        {/* Floating Action Button */}
        <button 
          onClick={() => { if(activeTrip) { setEditingItem(null); setIsAddModalOpen(true); } else { setEditingTrip(null); setIsAddTripModalOpen(true); } }}
          className="absolute bottom-24 right-6 bg-blue-600 text-white p-4 rounded-full shadow-lg hover:bg-blue-700 hover:scale-105 active:scale-95 transition-all z-20 print:hidden"
        >
          <Plus size={24} />
        </button>

        {/* Bottom Navigation */}
        {activeTrip && (
          <div className="absolute bottom-0 w-full bg-white border-t border-slate-200 px-6 py-4 flex justify-between items-center z-20 pb-safe animate-in slide-in-from-bottom-8 print:hidden">
            <NavButton icon={CalendarIcon} label="Calendar" isActive={activeTab === 'calendar'} onClick={() => setActiveTab('calendar')} />
            <NavButton icon={List} label="Itinerary" isActive={activeTab === 'day'} onClick={() => setActiveTab('day')} />
            <NavButton icon={CheckSquare} label="Checklist" isActive={activeTab === 'checklist'} onClick={() => setActiveTab('checklist')} />
            <NavButton icon={Wallet} label="Budget" isActive={activeTab === 'budget'} onClick={() => setActiveTab('budget')} />
          </div>
        )}

        {/* Modals */}
        {isAddModalOpen && activeTrip && (
          <AddItemForm 
            onClose={() => { setIsAddModalOpen(false); setEditingItem(null); }} 
            onSave={handleSaveItem}
            defaultDate={selectedDate}
            minDate={activeTrip.startDate}
            maxDate={activeTrip.endDate}
            initialData={editingItem}
            defaultCity={defaultLocationInfo.city}
            defaultCountry={defaultLocationInfo.country}
          />
        )}
        {isAddTripModalOpen && (
          <AddTripForm 
            onClose={() => { setIsAddTripModalOpen(false); setEditingTrip(null); }} 
            onSave={handleSaveTrip} 
            initialData={editingTrip} 
          />
        )}
        {isShareModalOpen && activeTrip && <ShareModal trip={activeTrip} onClose={() => setIsShareModalOpen(false)} />}
        {isJoinModalOpen && <JoinTripModal onClose={() => setIsJoinModalOpen(false)} onJoin={handleJoinTrip} />}
        
        {confirmModal.isOpen && (
          <div className="fixed inset-0 z-[150] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in">
            <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden">
              <div className="p-6">
                <h2 className="text-xl font-bold mb-2">{confirmModal.title}</h2>
                <p className="text-sm text-slate-500">{confirmModal.message}</p>
              </div>
              <div className="flex border-t border-slate-100 bg-slate-50">
                <button onClick={() => setConfirmModal({ isOpen: false })} className="flex-1 py-4 font-bold text-slate-500 hover:bg-slate-100 transition-colors">Cancel</button>
                {!confirmModal.isAlert && (
                  <button onClick={confirmModal.onConfirm} className="flex-1 py-4 font-bold text-red-600 hover:bg-red-50 transition-colors border-l border-slate-100">Confirm</button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NavButton({ icon: Icon, label, isActive, onClick }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-1 min-w-[64px] transition-colors ${isActive ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>
      <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
      <span className="text-[10px] font-medium uppercase tracking-wider">{label}</span>
    </button>
  );
}

function CalendarView({ trip, onSelectDate }) {
  const startDate = new Date(trip.startDate);
  const endDate = new Date(trip.endDate);
  const monthsToRender = [];
  let currentMonth = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  
  while (currentMonth <= endDate || (currentMonth.getMonth() === endDate.getMonth() && currentMonth.getFullYear() === endDate.getFullYear())) {
    monthsToRender.push(new Date(currentMonth));
    currentMonth.setMonth(currentMonth.getMonth() + 1);
  }

  const itemsByDate = trip.items.reduce((acc, item) => {
    if(item.category !== 'recommendation' && item.date) {
      let current = new Date(item.date);
      const end = new Date((item.endDate && item.endDate.trim() !== '') ? item.endDate : item.date);
      while (current <= end) {
        const dStr = current.toISOString().split('T')[0];
        acc[dStr] = (acc[dStr] || 0) + 1;
        current.setUTCDate(current.getUTCDate() + 1);
      }
    }
    return acc;
  }, {});

  return (
    <div className="p-6 space-y-8 animate-in fade-in duration-300">
      {monthsToRender.map((monthDate, idx) => (
        <div key={idx} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
          <h2 className="text-lg font-bold mb-4 ml-1">
            {monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </h2>
          <div className="grid grid-cols-7 gap-y-4 gap-x-1 text-center mb-2">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => <div key={i} className="text-xs font-semibold text-slate-400">{day}</div>)}
            {Array.from({ length: getFirstDayOfMonth(monthDate.getFullYear(), monthDate.getMonth()) }).map((_, i) => <div key={`empty-${i}`} />)}
            {Array.from({ length: getDaysInMonth(monthDate.getFullYear(), monthDate.getMonth()) }).map((_, i) => {
              const day = i + 1;
              const currentDayDate = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
              const offset = currentDayDate.getTimezoneOffset() * 60000;
              const dateString = (new Date(currentDayDate - offset)).toISOString().split('T')[0];
              
              const isTripDate = dateString >= trip.startDate && dateString <= trip.endDate;
              const hasItems = itemsByDate[dateString] > 0;
              
              return (
                <button
                  key={day} disabled={!isTripDate} onClick={() => onSelectDate(dateString)}
                  className={`
                    relative h-10 w-10 mx-auto rounded-full flex items-center justify-center text-sm transition-all
                    ${!isTripDate ? 'text-slate-300 cursor-not-allowed opacity-50' : 'hover:bg-slate-100 cursor-pointer'}
                    ${isTripDate ? 'bg-blue-50 text-blue-900 font-medium' : ''}
                  `}
                >
                  {day}
                  {hasItems && <span className="absolute bottom-1 w-1.5 h-1.5 bg-blue-500 rounded-full"></span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function DayView({ date, items, currentCities, recommendations, onDelete, onToggleIdea, onEdit, tripStart, tripEnd, onDateChange }) {
  const handlePrevDay = () => {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() - 1);
    const newDateStr = d.toISOString().split('T')[0];
    if (newDateStr >= tripStart) onDateChange(newDateStr);
  };
  
  const handleNextDay = () => {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() + 1);
    const newDateStr = d.toISOString().split('T')[0];
    if (newDateStr <= tripEnd) onDateChange(newDateStr);
  };

  const isFirstDay = date <= tripStart;
  const isLastDay = date >= tripEnd;
  
  // Group recommendations by subType for rendering
  const groupedRecommendations = recommendations.reduce((acc, idea) => {
    const type = idea.subType || 'other';
    if (!acc[type]) acc[type] = [];
    acc[type].push(idea);
    return acc;
  }, {});

  // Generate dynamic badges inside the timeline
  let lastCity = null;
  const timelineElements = [];

  items.forEach((item, index) => {
    const isStart = item.date === date;
    
    // Check for arrivals or check-ins to drop badges
    if (item.category === 'transport' && item.arrCity && isStart) {
       if (lastCity && lastCity.toLowerCase() !== item.arrCity.toLowerCase()) {
           timelineElements.push(
               <div key={`left-${index}`} className="relative flex justify-center py-2 z-10 animate-in fade-in zoom-in duration-300">
                  <div className="bg-slate-200 text-slate-700 text-[10px] uppercase tracking-wider font-bold px-3 py-1 rounded-full flex items-center gap-1.5 shadow-sm border border-slate-300">
                     <MapPin size={12} /> Left {lastCity}
                  </div>
               </div>
           );
       }
       timelineElements.push(
           <div key={`arr-${index}`} className="relative flex justify-center py-2 z-10 animate-in fade-in zoom-in duration-300">
              <div className="bg-blue-100 text-blue-800 text-[10px] uppercase tracking-wider font-bold px-3 py-1 rounded-full flex items-center gap-1.5 shadow-sm border border-blue-200">
                 <MapPin size={12} /> Arrived in {item.arrCity}
              </div>
           </div>
       );
       lastCity = item.arrCity;
    } else if (item.category === 'accommodation' && item.city && isStart) {
       if (lastCity && lastCity.toLowerCase() !== item.city.toLowerCase()) {
           timelineElements.push(
               <div key={`left-${index}`} className="relative flex justify-center py-2 z-10 animate-in fade-in zoom-in duration-300">
                  <div className="bg-slate-200 text-slate-700 text-[10px] uppercase tracking-wider font-bold px-3 py-1 rounded-full flex items-center gap-1.5 shadow-sm border border-slate-300">
                     <MapPin size={12} /> Left {lastCity}
                  </div>
               </div>
           );
       }
       timelineElements.push(
           <div key={`arr-${index}`} className="relative flex justify-center py-2 z-10 animate-in fade-in zoom-in duration-300">
              <div className="bg-indigo-100 text-indigo-800 text-[10px] uppercase tracking-wider font-bold px-3 py-1 rounded-full flex items-center gap-1.5 shadow-sm border border-indigo-200">
                 <Building size={12} /> Checked into {item.city}
              </div>
           </div>
       );
       lastCity = item.city;
    }

    timelineElements.push(
      <TripItemCard key={item.id} item={item} date={date} onEdit={onEdit} onDelete={onDelete} />
    );
  });

  return (
    <div className="animate-in slide-in-from-right-4 duration-300">
      <div className="bg-white sticky top-0 z-10 border-b border-slate-200 px-4 py-3 flex items-center justify-between shadow-sm print:hidden">
        <button onClick={handlePrevDay} disabled={isFirstDay} className={`p-2 rounded-full ${isFirstDay ? 'text-slate-200' : 'text-slate-600 hover:bg-slate-100'}`}>
          <ChevronLeft size={20} />
        </button>
        <div className="text-center flex-1 mx-2">
          <h2 className="font-bold text-lg">{formatDate(date)}</h2>
        </div>
        <button onClick={handleNextDay} disabled={isLastDay} className={`p-2 rounded-full ${isLastDay ? 'text-slate-200' : 'text-slate-600 hover:bg-slate-100'}`}>
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="p-4 sm:p-6 relative z-0">
        <div className="absolute left-[36px] top-6 bottom-0 w-0.5 bg-slate-200 -z-10"></div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-16 text-center text-slate-400">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4"><CalendarIcon size={32} className="text-slate-300" /></div>
            <p className="font-medium text-slate-600">No plans yet for this day.</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="absolute left-[36px] top-10 bottom-10 w-0.5 bg-slate-200 -z-10"></div>
            {timelineElements}
          </div>
        )}

        {recommendations && recommendations.length > 0 && (
          <div className="mt-10 pt-8 border-t-2 border-dashed border-slate-200">
            <h3 className="font-black text-lg text-slate-800 mb-6 flex items-center gap-2">
              <Lightbulb className="text-amber-500" /> 
              {currentCities.length > 0 ? `Ideas for this location` : 'General Trip Ideas'}
            </h3>
            
            {/* Categorized rendering for Ideas */}
            {Object.entries(groupedRecommendations).map(([type, ideas]) => {
               const config = SUB_TYPES.recommendation[type] || SUB_TYPES.recommendation.other;
               const TypeIcon = config.icon;
               return (
                  <div key={type} className="mb-6">
                     <h4 className="font-bold text-slate-700 flex items-center gap-2 mb-3 text-sm uppercase tracking-wider bg-slate-100 px-3 py-1.5 rounded-lg w-fit">
                        <TypeIcon size={16} className="text-amber-600" />
                        {config.label}
                     </h4>
                     <div className="space-y-3">
                       {ideas.map(item => (
                         <RecommendationCard key={item.id} item={item} onToggle={onToggleIdea} onEdit={onEdit} onDelete={onDelete} />
                       ))}
                     </div>
                  </div>
               );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function TripItemCard({ item, date, onEdit, onDelete }) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const catConfig = CATEGORIES[item.category] || CATEGORIES.activity;
  const subConfig = SUB_TYPES[item.category]?.[item.subType] || SUB_TYPES.activity.other;
  const TypeIcon = subConfig.icon;
  const mapUrl = item.location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.location)}` : null;

  const start = item.date;
  const end = (item.endDate && item.endDate.trim() !== '') ? item.endDate : item.date;
  
  const isMiddle = start !== end && date > start && date < end;
  const isEnd = start !== end && date === end;

  let displayTime = item.time;
  let statusLabel = '';

  if (item.category === 'accommodation') {
    if (isMiddle) { displayTime = 'All Day'; statusLabel = 'Staying'; }
    else if (isEnd) { displayTime = item.endTime || '11:00'; statusLabel = 'Check-out'; }
    else { statusLabel = 'Check-in'; }
  } else if (item.category === 'transport') {
    if (isMiddle) { displayTime = 'In Transit'; statusLabel = 'In Transit'; }
    else if (isEnd) { displayTime = item.endTime || item.time; statusLabel = 'Arrival'; }
    else { statusLabel = 'Departure'; }
  }

  return (
    <div className="flex gap-4 group cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
      <div className="flex flex-col items-center relative z-10 w-12 flex-shrink-0">
         <div className={`w-12 h-12 rounded-full flex items-center justify-center ${catConfig.bg} border-4 border-slate-50 shadow-sm mb-1`}>
            <TypeIcon size={20} className={catConfig.color} />
         </div>
         <span className={`text-[10px] font-bold text-slate-500 text-center leading-tight bg-white px-1 py-0.5 rounded ${isMiddle ? 'opacity-50' : ''}`}>{displayTime}</span>
      </div>
      
      <div className={`flex-1 bg-white border-l-4 ${catConfig.border} border-t border-r border-b border-slate-100 p-4 rounded-r-2xl rounded-tl-sm rounded-bl-sm shadow-sm relative transition-all hover:shadow-md ${isMiddle ? 'opacity-80' : ''}`}>
         <div className="flex justify-between items-start mb-2">
            <div className="flex gap-2 items-center flex-wrap">
              {statusLabel && (
                <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${isMiddle ? 'bg-slate-200 text-slate-700' : 'bg-blue-100 text-blue-800'}`}>
                  {statusLabel}
                </span>
              )}
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                {subConfig.label}
              </span>
            </div>
            {isExpanded && (
              <div className="flex gap-2 opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => onEdit(item)} className="p-1 text-slate-400 hover:text-blue-600 transition-colors bg-slate-50 rounded-md"><Edit2 size={14} /></button>
                <button onClick={() => onDelete(item.id)} className="p-1 text-slate-400 hover:text-red-600 transition-colors bg-slate-50 rounded-md"><Trash2 size={14} /></button>
              </div>
            )}
         </div>

         <h3 className="font-bold text-lg leading-tight mb-1">{item.title}</h3>
         
         {item.operator && (
           <p className="text-sm font-semibold text-slate-600 mb-2">
             {item.operator} {item.identifier && `• ${item.identifier}`}
           </p>
         )}

         {!isExpanded && (
           <div className="flex flex-col gap-1 text-xs text-slate-500 mt-2">
              {item.category === 'transport' ? (
                 item.depCity && <span className="flex items-center gap-1.5"><MapPin size={12}/> {item.depCity} {item.arrCity && `→ ${item.arrCity}`}</span>
              ) : (
                 item.city && <span className="flex items-center gap-1.5"><MapPin size={12}/> {item.city} {item.country && `, ${item.country}`}</span>
              )}
           </div>
         )}
         
         {!isExpanded && item.notes && <p className="text-xs text-slate-500 line-clamp-1 mt-2">{item.notes}</p>}

         {isExpanded && (
            <div className="mt-4 space-y-3 pt-3 border-t border-slate-100 animate-in fade-in duration-200">
              {start !== end && (
                <div className="text-xs text-slate-600 flex flex-col gap-1.5 bg-slate-50 p-2 rounded-lg">
                  <div className="flex items-center gap-1.5"><Clock size={14} className="text-slate-400" /> <span className="font-semibold">Start:</span> {formatDate(item.date)} at {item.time}</div>
                  <div className="flex items-center gap-1.5"><Clock size={14} className="text-slate-400" /> <span className="font-semibold">End:</span> {formatDate(item.endDate)} at {item.endTime || '11:00'}</div>
                </div>
              )}

              {item.category === 'transport' ? (
                 <div className="flex flex-col gap-2 bg-slate-50 p-3 rounded-lg text-sm">
                    <div className="flex items-start gap-2 text-slate-700">
                       <MapPin size={16} className="flex-shrink-0 mt-0.5 text-blue-500" />
                       <div>
                         <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px] block">Departure</span> 
                         <span className="font-semibold">{item.depCity} {item.depCountry && `, ${item.depCountry}`}</span>
                         {item.depTerminal && <span className="block text-xs text-slate-500 mt-0.5">{item.depTerminal}</span>}
                       </div>
                    </div>
                    {item.arrCity && (
                       <div className="flex items-start gap-2 text-slate-700 mt-1 pt-2 border-t border-slate-200/50">
                          <MapPin size={16} className="flex-shrink-0 mt-0.5 text-emerald-500" />
                          <div>
                            <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px] block">Arrival</span> 
                            <span className="font-semibold">{item.arrCity} {item.arrCountry && `, ${item.arrCountry}`}</span>
                            {item.arrTerminal && <span className="block text-xs text-slate-500 mt-0.5">{item.arrTerminal}</span>}
                          </div>
                       </div>
                    )}
                 </div>
              ) : (item.city || item.location || item.locationLocal) ? (
                <div className="mt-1 flex flex-col gap-2">
                  {item.city && (
                    <div className="inline-flex items-start gap-1.5 text-sm text-slate-700">
                      <MapPin size={14} className="mt-0.5 flex-shrink-0 text-indigo-400" />
                      <div>
                        <span className="font-semibold block">{item.city} {item.country && `, ${item.country}`}</span>
                        {item.location && (
                           <a href={mapUrl} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} className="text-blue-500 hover:text-blue-700 block mt-0.5 text-xs underline decoration-blue-200 underline-offset-2">{item.location}</a>
                        )}
                      </div>
                    </div>
                  )}
                  {item.locationLocal && (
                    <div className="ml-5 text-sm font-medium text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100">
                      {item.locationLocal}
                    </div>
                  )}
                </div>
              ) : null}

              {item.url && (
                <div className="mt-1">
                  <a href={item.url.startsWith('http') ? item.url : `https://${item.url}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-blue-700 transition-colors">
                    <LinkIcon size={14} className="text-blue-400" />
                    <span className="underline decoration-slate-200 underline-offset-2 font-medium">Website</span>
                  </a>
                </div>
              )}

              {item.attachmentUrl && (
                <div className="mt-2 pt-2 border-t border-slate-100">
                  <a href={item.attachmentUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-800 transition-colors">
                    <Paperclip size={14} /> View Attachment {item.attachmentName && `(${item.attachmentName})`}
                  </a>
                </div>
              )}

              {item.notes && <div className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg whitespace-pre-wrap">{item.notes}</div>}

              {item.cost > 0 && (
                <div className="flex items-center justify-between bg-slate-50 p-3 rounded-lg mt-2">
                  <span className="text-sm font-black text-slate-700">{formatCurrency(item.cost, item.currency)}</span>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md ${item.isPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{item.isPaid ? 'Paid' : 'Unpaid'}</span>
                </div>
              )}
            </div>
         )}
      </div>
    </div>
  );
}

function RecommendationCard({ item, onToggle, onEdit, onDelete }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const subConfig = SUB_TYPES.recommendation[item.subType] || SUB_TYPES.recommendation.other;

  return (
    <div className={`border-2 p-4 rounded-xl shadow-sm transition-all duration-200 cursor-pointer relative overflow-hidden group ${item.isCompleted ? 'bg-slate-50 border-slate-200 opacity-70' : 'bg-white border-amber-200 hover:border-amber-300'}`} onClick={() => setIsExpanded(!isExpanded)}>
      <div className="flex items-start gap-3">
         <button onClick={(e) => { e.stopPropagation(); onToggle(item.id, item.isCompleted); }} className={`mt-1 w-6 h-6 rounded flex items-center justify-center border-2 flex-shrink-0 transition-colors ${item.isCompleted ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 text-transparent hover:border-emerald-400'}`}>
            <CheckSquare size={14} />
         </button>
         
         <div className="flex-1">
            <div className="flex justify-between items-start mb-1">
              <h3 className={`font-bold text-lg leading-tight ${item.isCompleted ? 'line-through text-slate-500' : 'text-slate-800'}`}>{item.title}</h3>
              {isExpanded && (
                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => onEdit(item)} className="text-slate-400 hover:text-blue-600 transition-colors"><Edit2 size={14} /></button>
                  <button onClick={() => onDelete(item.id)} className="text-slate-400 hover:text-red-600 transition-colors"><Trash2 size={14} /></button>
                </div>
              )}
            </div>
            
            {!isExpanded && item.notes && <p className="text-xs text-slate-500 line-clamp-1 mt-1">{item.notes}</p>}

            {isExpanded && (
              <div className="mt-3 space-y-3 pt-3 border-t border-slate-100 animate-in fade-in duration-200">
                {(item.city || item.location) ? (
                  <div className="flex flex-col gap-1.5 text-sm">
                    <div className="flex items-start gap-1.5 text-slate-700">
                       <MapPin size={14} className="mt-0.5 flex-shrink-0 text-amber-500" />
                       <div>
                         <span className="font-semibold">{item.city} {item.country && `, ${item.country}`}</span>
                         {item.location && <span className="block text-xs text-slate-500 mt-0.5">{item.location}</span>}
                       </div>
                    </div>
                    {item.locationLocal && <div className="ml-5 text-sm font-medium text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100">{item.locationLocal}</div>}
                  </div>
                ) : null}
                
                {item.url && (
                  <div>
                    <a href={item.url.startsWith('http') ? item.url : `https://${item.url}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 transition-colors font-medium">
                      <LinkIcon size={14} /> <span className="underline decoration-blue-200 underline-offset-2">Website</span>
                    </a>
                  </div>
                )}
                
                {item.notes && <div className="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100 whitespace-pre-wrap">{item.notes}</div>}
              </div>
            )}
         </div>
      </div>
    </div>
  );
}

function ChecklistView({ trip, db, appId }) {
  const [newItem, setNewItem] = useState('');
  const checklist = trip.checklist || [];

  const handleToggle = async (itemId, currentStatus) => {
    const updatedChecklist = checklist.map(item => item.id === itemId ? { ...item, checked: !currentStatus } : item);
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'trips', trip.id), { checklist: updatedChecklist });
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if(!newItem.trim()) return;
    const newChecklist = [...checklist, { id: Date.now().toString(), text: newItem, checked: false }];
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'trips', trip.id), { checklist: newChecklist });
    setNewItem('');
  };

  const handleDelete = async (itemId) => {
    const newChecklist = checklist.filter(i => i.id !== itemId);
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'trips', trip.id), { checklist: newChecklist });
  };

  const completedCount = checklist.filter(i => i.checked).length;
  const progress = checklist.length === 0 ? 0 : (completedCount / checklist.length) * 100;

  return (
    <div className="p-6 space-y-6 animate-in fade-in duration-300">
      <div className="mb-2">
        <h2 className="text-xl font-bold">Packing & To-Do</h2>
        <p className="text-sm text-slate-500">Shared checklist for the trip.</p>
      </div>
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-2">
           <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Progress</span>
           <span className="text-xs font-bold text-blue-600">{completedCount} of {checklist.length}</span>
        </div>
        <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden mb-6">
           <div className="h-full bg-blue-500 rounded-full transition-all duration-500 ease-out" style={{ width: `${progress}%` }} />
        </div>
        <form onSubmit={handleAdd} className="flex gap-2 mb-6">
          <input type="text" value={newItem} onChange={e => setNewItem(e.target.value)} placeholder="Add an item..." className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm" />
          <button type="submit" disabled={!newItem.trim()} className="bg-slate-800 text-white px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-slate-900 transition-colors disabled:opacity-50"><Plus size={20} /></button>
        </form>
        <div className="space-y-1">
          {checklist.length === 0 ? (
            <div className="text-center py-6 text-slate-400 text-sm">List is empty. Add your first item!</div>
          ) : (
            checklist.map(item => (
              <div key={item.id} className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl transition-colors group border border-transparent hover:border-slate-100">
                <button onClick={() => handleToggle(item.id, item.checked)} className={`w-6 h-6 rounded-md flex items-center justify-center border-2 transition-all flex-shrink-0 ${item.checked ? 'bg-blue-500 border-blue-500 text-white' : 'border-slate-300 text-transparent hover:border-blue-400'}`}>
                   <CheckSquare size={14} />
                </button>
                <span className={`flex-1 text-sm font-medium transition-all ${item.checked ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{item.text}</span>
                <button onClick={() => handleDelete(item.id)} className="text-slate-300 hover:text-red-500 p-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={16} /></button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function BudgetView({ summary }) {
  const currenciesUsed = Object.keys(summary);
  return (
    <div className="p-6 space-y-6 animate-in fade-in duration-300">
      <div className="mb-2">
        <h2 className="text-xl font-bold">Financial Summary</h2>
        <p className="text-sm text-slate-500">Track your trip expenses and payments.</p>
      </div>

      {currenciesUsed.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-500 shadow-sm">
          <Wallet size={48} className="mx-auto text-slate-300 mb-3" />
          <p>No expenses added yet.</p>
        </div>
      ) : (
        currenciesUsed.map(curr => {
          const { total, paid, unpaid } = summary[curr];
          const progressPercent = total > 0 ? (paid / total) * 100 : 0;

          return (
            <div key={curr} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-5">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total Estimated ({curr})</p>
                <h3 className="text-3xl font-black">{formatCurrency(total, curr)}</h3>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-medium text-slate-500">
                  <span>Paid: {formatCurrency(paid, curr)}</span>
                  <span>Remaining: {formatCurrency(unpaid, curr)}</span>
                </div>
                <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all duration-1000 ease-out" style={{ width: `${progressPercent}%` }} />
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function AddTripForm({ onClose, onSave, initialData }) {
  const [formData, setFormData] = useState(initialData || { name: '', startDate: '', endDate: '' });
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name || !formData.startDate || !formData.endDate) return;
    if (formData.startDate > formData.endDate) { setError("End date cannot be before start date."); return; }
    setError('');
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6 animate-in fade-in">
      <div className="bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col animate-in slide-in-from-bottom-8">
        <div className="flex justify-between items-center p-5 border-b border-slate-100">
          <h2 className="text-xl font-bold">{initialData ? 'Edit Trip' : 'Plan a New Trip'}</h2>
          <button onClick={onClose} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-600"><X size={20} /></button>
        </div>
        
        <form onSubmit={handleSubmit} className="flex flex-col">
          <div className="p-6 space-y-5">
            {error && <div className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded-xl border border-red-100 flex items-center gap-2"><AlertCircle size={16} />{error}</div>}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Trip Name <span className="text-red-500">*</span></label>
              <input type="text" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. Summer in Tokyo" className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Start Date <span className="text-red-500">*</span></label>
                <input type="date" required value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">End Date <span className="text-red-500">*</span></label>
                <input type="date" required min={formData.startDate} value={formData.endDate} onChange={e => setFormData({...formData, endDate: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
              </div>
            </div>
          </div>
          <div className="p-5 border-t border-slate-100 bg-white sm:rounded-b-3xl mt-auto">
            <button type="submit" className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 transition-colors shadow-sm">{initialData ? 'Save Changes' : 'Create Trip'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddItemForm({ onClose, onSave, defaultDate, minDate, maxDate, initialData, defaultCity, defaultCountry }) {
  const [category, setCategory] = useState(initialData?.category || 'transport');
  const [error, setError] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  
  const [formData, setFormData] = useState({
    subType: initialData?.subType || 'flight', 
    title: initialData?.title || '', 
    date: initialData?.date || defaultDate || minDate, 
    time: initialData?.time || '10:00',
    endDate: initialData?.endDate || initialData?.date || defaultDate || minDate, 
    endTime: initialData?.endTime || '', 
    identifier: initialData?.identifier || '', 
    operator: initialData?.operator || '',
    location: initialData?.location || '', 
    locationLocal: initialData?.locationLocal || '',
    depCity: initialData?.depCity || '',
    depCountry: initialData?.depCountry || '',
    depTerminal: initialData?.depTerminal || '',
    arrCity: initialData?.arrCity || '',
    arrCountry: initialData?.arrCountry || '',
    arrTerminal: initialData?.arrTerminal || '',
    city: initialData?.city || (!initialData ? defaultCity : ''),
    country: initialData?.country || (!initialData ? defaultCountry : ''),
    url: initialData?.url || '', 
    cost: initialData?.cost || '', 
    currency: initialData?.currency || 'AUD', 
    isPaid: initialData?.isPaid || false, 
    notes: initialData?.notes || '',
    attachmentUrl: initialData?.attachmentUrl || '',
    attachmentName: initialData?.attachmentName || '',
  });

  const handleCategoryChange = (newCat) => {
    setCategory(newCat);
    setFormData(prev => ({ ...prev, subType: Object.keys(SUB_TYPES[newCat])[0] }));
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => {
       const updates = { [name]: type === 'checkbox' ? checked : value };
       if (name === 'date' && prev.endDate && value > prev.endDate) {
          updates.endDate = value;
       }
       return { ...prev, ...updates };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    let finalTitle = formData.title;

    if (category === 'transport') {
       if (!formData.depCity || !formData.arrCity) { setError("Please provide Departure and Arrival cities."); return; }
       finalTitle = `${formData.depCity} to ${formData.arrCity} ${SUB_TYPES.transport[formData.subType]?.label || 'Transport'}`;
    } else if (category === 'recommendation') {
       if (!formData.city) { setError("Please provide the city for this idea."); return; }
       if (!finalTitle) { setError("Please provide a title."); return; }
    } else {
       if (!finalTitle) { setError("Please provide a title."); return; }
    }

    if (category !== 'recommendation' && !formData.date) {
      setError("Please provide a start date."); return; 
    }

    let finalAttachmentUrl = formData.attachmentUrl;
    let finalAttachmentName = formData.attachmentName;

    if (selectedFile && storage) {
      setIsUploading(true);
      try {
        const fileRef = storageRef(storage, `attachments/${Date.now()}_${selectedFile.name}`);
        const snapshot = await uploadBytes(fileRef, selectedFile);
        finalAttachmentUrl = await getDownloadURL(snapshot.ref);
        finalAttachmentName = selectedFile.name;
      } catch (err) {
        console.error(err);
        setError("Failed to upload file. Check your Firebase Storage rules.");
        setIsUploading(false);
        return;
      }
      setIsUploading(false);
    }

    const itemToSave = { 
      ...formData, 
      title: finalTitle,
      category, 
      cost: formData.cost ? parseFloat(formData.cost) : 0,
      attachmentUrl: finalAttachmentUrl,
      attachmentName: finalAttachmentName
    };
    onSave(itemToSave);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6 animate-in fade-in">
      <div className="bg-white w-full h-[95%] sm:h-auto sm:max-h-[95vh] sm:max-w-md sm:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col animate-in slide-in-from-bottom-8">
        
        <div className="flex justify-between items-center p-5 border-b border-slate-100">
          <h2 className="text-xl font-bold">{initialData ? 'Edit Item' : 'Add to Trip'}</h2>
          <button type="button" onClick={onClose} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-600"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col h-full overflow-hidden">
          <div className="p-6 overflow-y-auto flex-1 custom-scrollbar space-y-6">
            {error && <div className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded-xl border border-red-100 flex items-center gap-2"><AlertCircle size={16} />{error}</div>}
            
            <div className="flex bg-slate-100 p-1.5 rounded-xl">
              {Object.entries(CATEGORIES).map(([key, config]) => (
                <button
                  key={key} type="button" onClick={() => handleCategoryChange(key)}
                  className={`flex-1 py-2.5 text-[11px] sm:text-xs font-bold rounded-lg transition-all ${category === key ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {config.label}
                </button>
              ))}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Type</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.entries(SUB_TYPES[category]).map(([key, config]) => {
                  const Icon = config.icon;
                  const isSelected = formData.subType === key;
                  return (
                    <button
                      key={key} type="button" onClick={() => setFormData(prev => ({ ...prev, subType: key }))}
                      className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                        isSelected ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-100 bg-white text-slate-600 hover:border-slate-200'
                      }`}
                    >
                      <Icon size={16} />
                      <span className="text-xs font-semibold">{config.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-4">
              {category === 'recommendation' && (
                <div className="grid grid-cols-2 gap-4 bg-amber-50/50 p-4 rounded-xl border border-amber-100">
                  <div className="col-span-2 text-xs font-bold text-amber-800 uppercase tracking-wider -mb-1">Target City <span className="text-red-500">*</span></div>
                  <div>
                    <input type="text" name="city" required value={formData.city || ''} onChange={handleChange} placeholder="City" className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                  </div>
                  <div>
                    <input type="text" name="country" value={formData.country || ''} onChange={handleChange} placeholder="Country" className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                  </div>
                </div>
              )}

              {category !== 'transport' && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                    {category === 'accommodation' ? 'Accommodation Name' : 'Title'} <span className="text-red-500">*</span>
                  </label>
                  <input type="text" name="title" required value={formData.title} onChange={handleChange} placeholder={category === 'accommodation' ? "e.g. Le Meurice..." : "e.g. Louvre Museum..."} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                </div>
              )}

              {(category === 'accommodation' || category === 'activity') && (
                <div className="grid grid-cols-2 gap-4 bg-indigo-50/50 p-4 rounded-xl border border-indigo-100">
                  <div className="col-span-2 text-xs font-bold text-indigo-800 uppercase tracking-wider -mb-1">Location <span className="text-red-500">*</span></div>
                  <div>
                    <input type="text" name="city" required value={formData.city || ''} onChange={handleChange} placeholder="City" className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                  </div>
                  <div>
                    <input type="text" name="country" value={formData.country || ''} onChange={handleChange} placeholder="Country" className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                  </div>
                </div>
              )}

              {category === 'transport' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Operator</label>
                      <input type="text" name="operator" value={formData.operator || ''} onChange={handleChange} placeholder="e.g. Qantas" className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Identifier</label>
                      <input type="text" name="identifier" value={formData.identifier || ''} onChange={handleChange} placeholder="e.g. QF 123" className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                    <div className="col-span-2 text-xs font-bold text-blue-800 uppercase tracking-wider mb-1">Departure <span className="text-red-500">*</span></div>
                    <div>
                      <input type="text" name="depCity" required value={formData.depCity || ''} onChange={handleChange} placeholder="City" className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                    </div>
                    <div>
                      <input type="text" name="depCountry" required value={formData.depCountry || ''} onChange={handleChange} placeholder="Country" className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                    </div>
                    <div className="col-span-2">
                      <input type="text" name="depTerminal" value={formData.depTerminal || ''} onChange={handleChange} placeholder="Airport / Station / Terminal (Optional)" className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 bg-emerald-50/50 p-4 rounded-xl border border-emerald-100">
                    <div className="col-span-2 text-xs font-bold text-emerald-800 uppercase tracking-wider mb-1">Arrival <span className="text-red-500">*</span></div>
                    <div>
                      <input type="text" name="arrCity" required value={formData.arrCity || ''} onChange={handleChange} placeholder="City" className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                    </div>
                    <div>
                      <input type="text" name="arrCountry" required value={formData.arrCountry || ''} onChange={handleChange} placeholder="Country" className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                    </div>
                    <div className="col-span-2">
                      <input type="text" name="arrTerminal" value={formData.arrTerminal || ''} onChange={handleChange} placeholder="Airport / Station / Terminal (Optional)" className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                    </div>
                  </div>
                </>
              )}

              {category !== 'recommendation' && (
                <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <div className="col-span-2">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                       {category === 'transport' ? 'Departure Time' : (category === 'accommodation' ? 'Check-in' : 'Start')} <span className="text-red-500">*</span>
                    </span>
                  </div>
                  <div>
                    <input type="date" name="date" required min={minDate} max={maxDate} value={formData.date} onChange={handleChange} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-500 text-sm" />
                  </div>
                  <div>
                    <input type="time" name="time" required value={formData.time} onChange={handleChange} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-500 text-sm" />
                  </div>

                  <div className="col-span-2 mt-2 border-t border-slate-200 pt-3">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                       {category === 'transport' ? 'Arrival Time (Optional)' : (category === 'accommodation' ? <>Check-out <span className="text-red-500">*</span></> : 'End (Optional)')}
                    </span>
                  </div>
                  <div>
                    <input type="date" name="endDate" required={category==='accommodation'} min={formData.date} max={maxDate} value={formData.endDate || ''} onChange={handleChange} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-500 text-sm" />
                  </div>
                  <div>
                    <input type="time" name="endTime" required={category==='accommodation'} value={formData.endTime} onChange={handleChange} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-500 text-sm" />
                  </div>
                </div>
              )}

              {category !== 'transport' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">English Address / Exact Location</label>
                    <input type="text" name="location" value={formData.location || ''} onChange={handleChange} placeholder="Full English address..." className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Local Language Address</label>
                    <input type="text" name="locationLocal" value={formData.locationLocal || ''} onChange={handleChange} placeholder="Paste Chinese, Arabic, Japanese, etc..." className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium" />
                  </div>
                </div>
              )}
              
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Website URL</label>
                <input type="url" name="url" value={formData.url} onChange={handleChange} placeholder="https://..." className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 space-y-4">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Cost</label>
              <div className="flex gap-4 items-start">
                <div className="flex-1">
                  <input type="number" name="cost" min="0" step="0.01" value={formData.cost} onChange={handleChange} placeholder="0.00" className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                </div>
                <div className="w-28">
                  <select name="currency" value={formData.currency} onChange={handleChange} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 appearance-none font-medium text-center">
                    {currencies.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-3 p-4 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                <input type="checkbox" name="isPaid" checked={formData.isPaid} onChange={handleChange} className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500 border-slate-300" />
                <span className="font-medium text-slate-700">I have already paid for this</span>
              </label>
            </div>

            <div className="pt-4 border-t border-slate-100">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Notes</label>
              <textarea name="notes" rows="3" value={formData.notes} onChange={handleChange} placeholder="Booking refs, terminal info..." className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"></textarea>
            </div>

            <div className="pt-4 border-t border-slate-100">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Attachment (Ticket / Booking PDF)</label>
              <div className="flex items-center gap-3">
                <label className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 hover:bg-slate-100 hover:border-blue-400 cursor-pointer transition-colors">
                  <UploadCloud size={18} className="text-slate-500" />
                  <span className="text-sm font-medium text-slate-600 truncate">
                    {selectedFile ? selectedFile.name : (formData.attachmentName || 'Upload File or Image')}
                  </span>
                  <input type="file" className="hidden" onChange={(e) => setSelectedFile(e.target.files[0])} accept="image/*,application/pdf" />
                </label>
                {(selectedFile || formData.attachmentUrl) && (
                  <button type="button" onClick={() => { setSelectedFile(null); setFormData(prev => ({...prev, attachmentUrl: '', attachmentName: ''})) }} className="p-3 text-red-500 hover:bg-red-50 rounded-xl transition-colors border border-red-100" title="Remove attachment">
                    <X size={18} />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="p-5 border-t border-slate-100 bg-white sm:rounded-b-3xl mt-auto">
            <button type="submit" disabled={isUploading} className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-70 flex items-center justify-center gap-2">
              {isUploading ? <><Loader2 size={18} className="animate-spin" /> Uploading...</> : (initialData ? 'Save Changes' : 'Save Item')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ShareModal({ trip, onClose }) {
  const [copied, setCopied] = useState(false);
  
  // Cleanly grab the current base URL, stripping out any existing URL parameters
  const baseUrl = window.location.href.split('?')[0];
  const shareLink = `${baseUrl}?join=${trip.id}`;

  const handleCopy = () => {
    // Fallback for browsers/iframes that block the Clipboard API
    const fallbackCopyTextToClipboard = (text) => {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      
      // Avoid scrolling to bottom and make the box completely invisible
      textArea.style.top = "0";
      textArea.style.left = "0";
      textArea.style.position = "fixed";
      textArea.style.opacity = "0"; 

      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();

      try {
        const successful = document.execCommand('copy');
        if (successful) {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } else {
            console.error('Fallback: Copying text command was unsuccessful');
        }
      } catch (err) {
        console.error('Fallback: Oops, unable to copy', err);
      }

      document.body.removeChild(textArea);
    };

    if (!navigator.clipboard) {
      fallbackCopyTextToClipboard(shareLink);
      return;
    }

    navigator.clipboard.writeText(shareLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(err => {
      // If the clipboard API fails (e.g., due to iframe permissions), use the fallback
      console.warn("Clipboard API failed, using fallback.", err);
      fallbackCopyTextToClipboard(shareLink);
    });
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in">
      <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-6 text-center overflow-hidden">
         <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4"><Share2 size={32} /></div>
         <h2 className="text-xl font-bold mb-2">Share this Trip</h2>
         <p className="text-sm text-slate-500 mb-6">Send this link to friends so they can automatically join and collaborate on the itinerary.</p>
         <div className="bg-slate-100 p-3 rounded-xl flex items-center justify-between mb-6 border border-slate-200 gap-2">
            <div className="overflow-x-auto whitespace-nowrap scrollbar-hide flex-1 text-left">
              <code className="font-mono text-slate-700 text-xs select-all">{shareLink}</code>
            </div>
            <button onClick={handleCopy} className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors uppercase tracking-wider shrink-0 bg-slate-100 pl-3 border-l border-slate-200">{copied ? 'Copied!' : 'Copy'}</button>
         </div>
         <button onClick={onClose} className="w-full bg-slate-800 text-white font-bold py-3 rounded-xl hover:bg-slate-900 transition-colors">Done</button>
      </div>
    </div>
  );
}

function JoinTripModal({ onClose, onJoin }) {
  const [tripId, setTripId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!tripId.trim()) return;
    setLoading(true);
    setError('');
    const result = await onJoin(tripId.trim());
    if (result.success) onClose(); else setError(result.message);
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in">
      <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden relative">
        <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-slate-50">
          <h2 className="text-lg font-bold">Join a Trip</h2>
          <button onClick={onClose} className="p-2 bg-slate-200 hover:bg-slate-300 rounded-full text-slate-600 transition-colors"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6">
           <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Trip Share Code</label>
           <input type="text" autoFocus required value={tripId} onChange={e => setTripId(e.target.value)} placeholder="Paste code here..." className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-center font-mono tracking-wider" />
           {error && <div className="mt-3 text-red-500 text-sm flex items-center justify-center gap-1.5 font-medium"><AlertCircle size={14} /> {error}</div>}
           <button disabled={loading} type="submit" className="w-full mt-6 bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">{loading ? 'Joining...' : 'Join Trip'}</button>
        </form>
      </div>
    </div>
  );
}

function AuthScreen({ auth }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    if (!auth) return setError("Firebase is not connected.");
    setError(''); setLoading(true);
    try {
      if (isLogin) await signInWithEmailAndPassword(auth, email, password);
      else await createUserWithEmailAndPassword(auth, email, password);
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  const handleGoogleAuth = async () => {
    if (!auth) return setError("Firebase is not connected.");
    setError('');
    const provider = new GoogleAuthProvider();
    try { await signInWithPopup(auth, provider); } catch (err) { setError(err.message); }
  };

  const handleGuestAuth = async () => {
    if (!auth) return setError("Firebase is not connected.");
    setError('');
    try { await signInAnonymously(auth); } catch (err) { setError(err.message); }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans text-slate-800">
      <div className="bg-white w-full max-w-sm p-8 rounded-3xl shadow-xl">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4"><Globe2 size={32} /></div>
          <h1 className="text-2xl font-bold">Travel Itinerary</h1>
          <p className="text-sm text-slate-500 mt-1">Plan your perfect trip</p>
        </div>

        {error && <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm mb-6 flex items-start gap-2"><AlertCircle size={16} className="mt-0.5 flex-shrink-0" /> {error}</div>}

        <form onSubmit={handleEmailAuth} className="space-y-4 mb-6">
          <input type="email" required placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
          <input type="password" required placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
          <button type="submit" disabled={loading} className="w-full bg-slate-800 text-white font-bold py-3 rounded-xl hover:bg-slate-900 transition-colors disabled:opacity-70">
            {loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        <div className="relative flex items-center justify-center mb-6">
          <div className="absolute border-t border-slate-200 w-full"></div>
          <span className="bg-white px-3 text-[10px] text-slate-400 font-bold relative uppercase tracking-wider">Or</span>
        </div>

        <button onClick={handleGoogleAuth} className="w-full flex items-center justify-center gap-3 bg-white border border-slate-200 text-slate-700 font-bold py-3 rounded-xl hover:bg-slate-50 transition-colors mb-4">
          <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
          Continue with Google
        </button>

        <button onClick={handleGuestAuth} className="w-full text-slate-500 font-medium text-sm hover:text-slate-800 transition-colors mb-6">Continue as Guest</button>

        <p className="text-center text-sm text-slate-500">
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button onClick={() => setIsLogin(!isLogin)} className="font-bold text-blue-600 hover:underline">{isLogin ? 'Sign up' : 'Sign in'}</button>
        </p>
      </div>
    </div>
  );
}