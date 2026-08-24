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
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { 
  Calendar as CalendarIcon, List, Wallet, Plus, Plane, Bed, MapPin, 
  Train, Car, Bus, Ship, Navigation, Building, Home, Users, Trash2, 
  X, ChevronLeft, ChevronRight, Clock, Globe2, CalendarDays, ExternalLink, 
  Link as LinkIcon, Share2, UserPlus, AlertCircle, Edit2, LogOut, ChevronDown, ChevronUp,
  CheckSquare, Paperclip, Printer
} from 'lucide-react';

// ============================================================================
// ⚠️ FIREBASE CONFIGURATION
// ============================================================================
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
  
  enableIndexedDbPersistence(db).catch((err) => {
    console.warn("Offline persistence error:", err.code);
  });
} catch (e) {
  console.error("Firebase init error:", e);
}

// Your requested App ID for Firestore collections
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

const getLocationAtStartOfDay = (date, tripItems) => {
  if (!tripItems || tripItems.length === 0) return 'Origin';
  
  // Find all transport items that arrive BEFORE the current selected date
  const pastTransports = tripItems.filter(i => 
    i.category === 'transport' && 
    i.arrivalLocation && 
    (i.endDate || i.date) < date
  ).sort((a, b) => {
    const endA = a.endDate || a.date;
    const endB = b.endDate || b.date;
    if (endA !== endB) return endA.localeCompare(endB);
    return (a.endTime || a.time || '00:00').localeCompare(b.endTime || b.time || '00:00');
  });

  if (pastTransports.length > 0) {
    return pastTransports[pastTransports.length - 1].arrivalLocation;
  }

  // Fallback: Check the departure location of the very first transport of the trip
  const firstTransport = [...tripItems].sort((a,b) => a.date.localeCompare(b.date)).find(i => i.category === 'transport' && i.location);
  return firstTransport ? firstTransport.location : 'Unknown Location';
};

const CATEGORIES = {
  transport: { label: 'Transport', color: 'text-blue-600', bg: 'bg-blue-100', border: 'border-blue-200' },
  accommodation: { label: 'Accommodation', color: 'text-indigo-600', bg: 'bg-indigo-100', border: 'border-indigo-200' },
  activity: { label: 'Activity', color: 'text-emerald-600', bg: 'bg-emerald-100', border: 'border-emerald-200' }
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
    tour: { icon: MapPin, label: 'Tour / Sightseeing' },
    dining: { icon: MapPin, label: 'Dining' },
    event: { icon: CalendarIcon, label: 'Event / Show' },
    other: { icon: MapPin, label: 'Other Activity' }
  }
};

const currencies = ['AUD', 'USD', 'EUR', 'GBP', 'CAD', 'JPY']; // AUD defaults first

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

  // Authentication Effect
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

  // Database Snapshot Effect
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

  const activeTrip = trips.find(t => t.id === activeTripId);

  const startLocation = useMemo(() => getLocationAtStartOfDay(selectedDate, activeTrip?.items || []), [selectedDate, activeTrip]);

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

  const getSortTime = (item, date) => {
    if (item.date === date) return item.time || '00:00';
    if (item.endDate === date) return item.endTime || '00:00';
    return '00:00'; // Carry-overs pin to the top of the day
  };

  const itemsForSelectedDate = useMemo(() => {
    if (!activeTrip || !selectedDate) return [];
    
    return activeTrip.items
      .filter(item => {
        // If it spans multiple days, include it if the selected date falls within the range
        if (item.endDate && item.endDate !== item.date) {
          return selectedDate >= item.date && selectedDate <= item.endDate;
        }
        return item.date === selectedDate;
      })
      .sort((a, b) => {
        const timeA = getSortTime(a, selectedDate);
        const timeB = getSortTime(b, selectedDate);
        
        // Primary sort by chronological time on that specific day
        if (timeA !== timeB) return timeA.localeCompare(timeB);
        
        // Secondary sort: keep categories grouped if times are identical (e.g. 00:00 carry-overs)
        return a.category.localeCompare(b.category);
      });
  }, [activeTrip, selectedDate]);

  const handleSaveTrip = async (tripData) => {
    if (!user) return;
    try {
      if (editingTrip) {
        const tripRef = doc(db, 'artifacts', appId, 'public', 'data', 'trips', editingTrip.id);
        await updateDoc(tripRef, { name: tripData.name, startDate: tripData.startDate, endDate: tripData.endDate });
        setEditingTrip(null);
      } else {
        const trip = { ...tripData, ownerId: user.uid, sharedWith: [], items: [] };
        await setDoc(doc(collection(db, 'artifacts', appId, 'public', 'data', 'trips')), trip);
      }
      setIsAddTripModalOpen(false);
    } catch (e) { setConfirmModal({ isOpen: true, title: "Error", message: e.message, isAlert: true }); }
  };

  const requestDeleteTrip = (id, e) => {
    e.stopPropagation();
    setConfirmModal({
      isOpen: true,
      title: "Delete Trip?",
      message: "Are you sure you want to delete this trip entirely? This affects everyone sharing it.",
      onConfirm: async () => {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'trips', id));
        if (activeTripId === id) setActiveTripId(null);
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
      } else {
        return { success: false, message: "Trip not found. Check the ID." };
      }
    } catch (e) { return { success: false, message: "Error joining trip." }; }
  };

  const handleSaveItem = async (itemData) => {
    if (!activeTrip) return;
    let newItems;
    if (editingItem) {
      newItems = activeTrip.items.map(i => i.id === editingItem.id ? { ...itemData, id: editingItem.id } : i);
      setEditingItem(null);
    } else {
      newItems = [...activeTrip.items, { ...itemData, id: Date.now().toString() }];
    }
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'trips', activeTripId), { items: newItems });
    setIsAddModalOpen(false);
    setSelectedDate(itemData.date);
    setActiveTab('day');
  };

  const requestDeleteItem = (itemId) => {
    setConfirmModal({
      isOpen: true,
      title: "Delete Item?",
      message: "Are you sure you want to remove this item from your itinerary?",
      onConfirm: async () => {
        const newItems = activeTrip.items.filter(item => item.id !== itemId);
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'trips', activeTripId), { items: newItems });
        setConfirmModal({ isOpen: false });
      }
    });
  };

  const handleExportPDF = () => {
    if (!activeTrip) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return; 

    let html = `
      <html>
        <head>
          <title>${activeTrip.name} - Itinerary</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; padding: 40px; color: #1e293b; }
            h1 { border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; color: #0f172a; margin-bottom: 5px; }
            .day-block { margin-top: 30px; page-break-inside: avoid; }
            .day-title { background: #f1f5f9; padding: 10px 15px; border-radius: 8px; margin-bottom: 15px; font-weight: bold; font-size: 1.2em; }
            .item-row { display: flex; padding: 12px 0; border-bottom: 1px solid #f1f5f9; }
            .item-time { width: 90px; font-weight: bold; color: #475569; }
            .item-details { flex: 1; }
            .item-title { font-weight: bold; font-size: 1.1em; margin-bottom: 4px; color: #0f172a; }
            .item-meta { font-size: 0.9em; color: #64748b; margin-top: 2px; }
          </style>
        </head>
        <body>
          <h1>${activeTrip.name}</h1>
          <p style="color: #64748b; margin-top: 0;"><strong>Dates:</strong> ${formatDate(activeTrip.startDate)} - ${formatDate(activeTrip.endDate)}</p>
    `;

    const itemsByDate = {};
    activeTrip.items.forEach(item => {
      let current = new Date(item.date);
      const end = new Date(item.endDate || item.date);
      while (current <= end) {
        const dStr = current.toISOString().split('T')[0];
        if(!itemsByDate[dStr]) itemsByDate[dStr] = [];
        
        let displayTime = item.time;
        if (item.category === 'accommodation') {
          if (dStr === item.date && dStr === item.endDate) displayTime = item.time + ' (In/Out)';
          else if (dStr === item.date) displayTime = item.time + ' (In)';
          else if (dStr === item.endDate) displayTime = (item.endTime || '11:00') + ' (Out)';
          else displayTime = 'All Day';
        } else if (item.category === 'transport') {
          if (dStr === item.date) displayTime = item.time;
          else if (dStr === item.endDate) displayTime = item.endTime || item.time;
          else displayTime = 'All Day';
        }
        itemsByDate[dStr].push({ ...item, displayTime });
        current.setUTCDate(current.getUTCDate() + 1);
      }
    });

    Object.keys(itemsByDate).sort().forEach(dateStr => {
      html += `<div class="day-block"><div class="day-title">${formatDate(dateStr)}</div>`;
      itemsByDate[dateStr].sort((a,b) => {
        const timeA = a.date === dateStr ? a.time : (a.endDate === dateStr ? (a.endTime || '00:00') : '00:00');
        const timeB = b.date === dateStr ? b.time : (b.endDate === dateStr ? (b.endTime || '00:00') : '00:00');
        return timeA.localeCompare(timeB);
      }).forEach(item => {
        html += `
          <div class="item-row">
            <div class="item-time">${item.displayTime}</div>
            <div class="item-details">
              <div class="item-title">${item.title}</div>
              <div class="item-meta">${item.category.toUpperCase()} ${item.location ? `• ${item.location}` : ''}</div>
              ${item.notes ? `<div class="item-meta" style="margin-top:6px;">${item.notes}</div>` : ''}
            </div>
          </div>
        `;
      });
      html += `</div>`;
    });

    html += `</body></html>`;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 250); 
  };

  const requestDeleteChecklistItem = (itemId) => {
    setConfirmModal({
      isOpen: true,
      title: "Delete Checklist Item?",
      message: "Remove this from your packing list?",
      onConfirm: async () => {
        const newChecklist = (activeTrip.checklist || []).filter(i => i.id !== itemId);
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'trips', activeTripId), { checklist: newChecklist });
        setConfirmModal({ isOpen: false });
      }
    });
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
                <p className="text-slate-400 text-sm mt-1">Manage your upcoming adventures</p>
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
                <button onClick={handleExportPDF} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-full transition-colors text-slate-300 hover:text-white" title="Print/Export PDF">
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
        <div className="flex-1 overflow-y-auto pb-24 relative">
          {!activeTrip && (
            <div className="p-6 space-y-4 animate-in fade-in duration-300">
              {trips.length === 0 ? (
                <div className="text-center py-12 px-4 text-slate-500">
                  <Globe2 size={48} className="mx-auto text-slate-300 mb-4" />
                  <p className="font-medium text-slate-700 text-lg">No trips planned yet</p>
                  <p className="text-sm mt-1">Create or join a trip to get started.</p>
                </div>
              ) : (
                trips.map(trip => (
                  <div key={trip.id} onClick={() => { setActiveTripId(trip.id); setSelectedDate(trip.startDate); setActiveTab('calendar'); }} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all cursor-pointer group relative">
                    <button onClick={(e) => requestDeleteTrip(trip.id, e)} className="absolute top-4 right-4 text-slate-300 hover:text-red-500 transition-colors opacity-100 sm:opacity-0 group-hover:opacity-100">
                      <Trash2 size={18} />
                    </button>
                    <div className="pr-8">
                      <h3 className="text-lg font-bold truncate">{trip.name}</h3>
                      <div className="flex items-center gap-4 mt-3 text-sm text-slate-500">
                        <div className="flex items-center gap-1.5"><CalendarDays size={16} className="text-blue-500" /><span>{formatDate(trip.startDate)}</span></div>
                      </div>
                      {trip.sharedWith.length > 0 && (
                        <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-blue-600 bg-blue-50 w-fit px-2 py-0.5 rounded-md">
                          <Users size={12} /> Shared
                        </div>
                      )}
                    </div>
                  </div>
                ))
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
                  startLocation={startLocation}
                  onDelete={requestDeleteItem}
                  onEdit={(item) => { setEditingItem(item); setIsAddModalOpen(true); }}
                  tripStart={activeTrip.startDate}
                  tripEnd={activeTrip.endDate}
                  onDateChange={setSelectedDate}
                />
              )}
              {activeTab === 'checklist' && <ChecklistView trip={activeTrip} db={db} appId={appId} onDelete={requestDeleteChecklistItem} />}
              {activeTab === 'budget' && <BudgetView summary={budgetSummary} items={activeTrip.items} />}
            </>
          )}
        </div>

        {/* Floating Action Button */}
        <button 
          onClick={() => { if(activeTrip) { setEditingItem(null); setIsAddModalOpen(true); } else { setEditingTrip(null); setIsAddTripModalOpen(true); } }}
          className="absolute bottom-24 right-6 bg-blue-600 text-white p-4 rounded-full shadow-lg hover:bg-blue-700 hover:scale-105 active:scale-95 transition-all z-20"
        >
          <Plus size={24} />
        </button>

        {/* Bottom Navigation */}
        {activeTrip && (
          <div className="absolute bottom-0 w-full bg-white border-t border-slate-200 px-6 py-4 flex justify-between items-center z-20 pb-safe animate-in slide-in-from-bottom-8">
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
            tripId={activeTripId}
            storage={storage}
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
          <div className="absolute inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in">
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
    acc[item.date] = (acc[item.date] || 0) + 1;
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

function AddTripForm({ onClose, onSave, initialData }) {
  const [formData, setFormData] = useState(initialData || { name: '', startDate: '', endDate: '' });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name || !formData.startDate || !formData.endDate) return;
    if (formData.startDate > formData.endDate) { alert("End date cannot be before start date."); return; }
    onSave(formData);
  };

  return (
    <div className="absolute inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6 animate-in fade-in">
      <div className="bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col animate-in slide-in-from-bottom-8">
        <div className="flex justify-between items-center p-5 border-b border-slate-100">
          <h2 className="text-xl font-bold">{initialData ? 'Edit Trip' : 'Plan a New Trip'}</h2>
          <button onClick={onClose} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-600"><X size={20} /></button>
        </div>
        <div className="p-6">
          <form id="add-trip-form" onSubmit={handleSubmit} className="space-y-5">
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
          </form>
        </div>
        <div className="p-5 border-t border-slate-100 bg-white sm:rounded-b-3xl">
          <button type="submit" form="add-trip-form" className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 transition-colors shadow-sm">{initialData ? 'Save Changes' : 'Create Trip'}</button>
        </div>
      </div>
    </div>
  );
}

function DayView({ date, items, startLocation, arrivalLocations, onDelete, onEdit, tripStart, tripEnd, onDateChange }) {
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

  return (
    <div className="animate-in slide-in-from-right-4 duration-300">
      <div className="bg-white sticky top-0 z-10 border-b border-slate-200 px-4 py-3 flex items-center justify-between shadow-sm">
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
        
        {/* The Timeline Line */}
        <div className="absolute left-[40px] sm:left-[52px] top-6 bottom-0 w-0.5 bg-slate-200 -z-10"></div>

        {/* Start Location Banner */}
        <div className="flex items-center gap-3 mb-6 relative z-10 ml-[8px] sm:ml-[20px] animate-in fade-in zoom-in duration-500">
           <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center border-[3px] border-slate-100 shadow-md flex-shrink-0">
              <MapPin size={14} />
           </div>
           <span className="font-black text-slate-800 uppercase tracking-widest text-sm bg-white px-3 py-1.5 rounded-lg shadow-sm border border-slate-100">
              {startLocation}
           </span>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-10 text-center text-slate-400">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4"><CalendarIcon size={32} className="text-slate-300" /></div>
            <p className="font-medium text-slate-600">No plans yet for this day.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((item) => {
               const arrivesToday = item.category === 'transport' && item.arrivalLocation && (item.endDate || item.date) === date;
               
               return (
                 <React.Fragment key={item.id}>
                   <TripItemCard 
                     item={item} 
                     currentDate={date} 
                     onEdit={onEdit} 
                     onDelete={onDelete} 
                   />
                   
                   {/* Mid-Day Arrival Marker */}
                   {arrivesToday && (
                      <div className="flex items-center gap-3 my-5 relative z-10 ml-[8px] sm:ml-[20px] animate-in slide-in-from-top-2">
                         <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center border-[3px] border-white shadow-sm flex-shrink-0">
                            <MapPin size={14} />
                         </div>
                         <span className="text-sm font-bold text-slate-700 bg-white px-3 py-1.5 rounded-lg border border-blue-100 shadow-sm text-blue-900">
                           Arrived in {item.arrivalLocation}
                         </span>
                      </div>
                   )}
                 </React.Fragment>
               );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function TripItemCard({ item, currentDate, onEdit, onDelete }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const catConfig = CATEGORIES[item.category] || CATEGORIES.activity;
  const subConfig = SUB_TYPES[item.category]?.[item.subType] || SUB_TYPES.activity.other;
  const TypeIcon = subConfig.icon;

  // Calculate span status
  const isStart = item.date === currentDate;
  const isEnd = item.endDate && item.endDate === currentDate;
  const isMiddle = item.endDate && currentDate > item.date && currentDate < item.endDate;

  let statusLabel = '';
  let displayTime = '';
  let badgeColor = '';
  let cardBg = '';

  // Handle distinct Category stylings and Badges
  if (item.category === 'accommodation') {
      cardBg = 'bg-indigo-50/70 hover:bg-indigo-50 border-indigo-100';
      if (isStart && isEnd) { statusLabel = 'Check-in/out'; displayTime = item.time; badgeColor = 'bg-indigo-200 text-indigo-800'; }
      else if (isStart) { statusLabel = 'Check-in'; displayTime = item.time; badgeColor = 'bg-indigo-200 text-indigo-800'; }
      else if (isEnd) { statusLabel = 'Check-out'; displayTime = item.endTime || '11:00'; badgeColor = 'bg-amber-200 text-amber-800'; }
      else { statusLabel = 'Staying'; displayTime = 'All Day'; badgeColor = 'bg-slate-200 text-slate-700'; }
  } else if (item.category === 'transport') {
      cardBg = 'bg-blue-50/70 hover:bg-blue-50 border-blue-100';
      if (isStart && isEnd) { statusLabel = 'Depart/Arrive'; displayTime = item.time; badgeColor = 'bg-blue-200 text-blue-800'; }
      else if (isStart) { statusLabel = 'Departure'; displayTime = item.time; badgeColor = 'bg-blue-200 text-blue-800'; }
      else if (isEnd) { statusLabel = 'Arrival'; displayTime = item.endTime || item.time; badgeColor = 'bg-emerald-200 text-emerald-800'; }
      else { statusLabel = 'In Transit'; displayTime = 'All Day'; badgeColor = 'bg-slate-200 text-slate-700'; }
  } else {
      cardBg = 'bg-emerald-50/70 hover:bg-emerald-50 border-emerald-100';
      if (isStart && isEnd) { statusLabel = 'Activity'; displayTime = item.time; badgeColor = 'bg-emerald-200 text-emerald-800'; }
      else if (isStart) { statusLabel = 'Starts'; displayTime = item.time; badgeColor = 'bg-emerald-200 text-emerald-800'; }
      else if (isEnd) { statusLabel = 'Ends'; displayTime = item.endTime || 'End of Day'; badgeColor = 'bg-slate-200 text-slate-700'; }
      else { statusLabel = 'Ongoing'; displayTime = 'All Day'; badgeColor = 'bg-slate-200 text-slate-700'; }
  }

  return (
    <div className="flex gap-3 sm:gap-4 group cursor-pointer relative z-10" onClick={() => setIsExpanded(!isExpanded)}>
      
      {/* Left Timeline Side - Stacked Icon over Time */}
      <div className="flex flex-col items-center min-w-[48px] sm:min-w-[56px] flex-shrink-0 pt-1">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${catConfig.bg} border-4 border-slate-100 shadow-sm relative z-10`}>
          <TypeIcon size={18} className={catConfig.color} />
        </div>
        <span className={`text-[10px] sm:text-xs font-bold mt-1.5 text-center bg-white px-1.5 py-0.5 rounded-md border border-slate-200 shadow-sm tracking-wider ${isMiddle ? 'text-slate-400' : 'text-slate-600'}`}>
          {displayTime}
        </span>
      </div>
      
      {/* Right Card Side */}
      <div className={`flex-1 border p-4 rounded-xl shadow-sm transition-all duration-200 ${cardBg} relative w-full overflow-hidden`}>
        
        {/* Top Header Row */}
        <div className="flex justify-between items-start mb-1.5">
          <div className="flex gap-2 items-center flex-wrap">
            {statusLabel && (
              <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${badgeColor}`}>
                {statusLabel}
              </span>
            )}
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 opacity-80">
              {subConfig.label}
            </span>
          </div>

          {isExpanded && (
            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => onEdit(item)} className="p-1 text-slate-400 hover:text-blue-600 transition-colors bg-white rounded-md shadow-sm"><Edit2 size={14} /></button>
              <button onClick={() => onDelete(item.id)} className="p-1 text-slate-400 hover:text-red-600 transition-colors bg-white rounded-md shadow-sm"><Trash2 size={14} /></button>
            </div>
          )}
        </div>

        {/* Title and Subtitle */}
        <h3 className="font-bold text-lg leading-tight mb-0.5">{item.title}</h3>
        {item.operator && (
          <p className="text-sm font-semibold text-slate-600 mb-1">
            {item.operator} {item.identifier && `• ${item.identifier}`}
          </p>
        )}

        {/* COMPACT VIEW: Truncated Notes */}
        {!isExpanded && item.notes && (
          <p className="text-xs text-slate-500 line-clamp-1 mt-2">{item.notes}</p>
        )}

        {/* EXPANDED VIEW: Full Details */}
        {isExpanded && (
          <div className="mt-4 space-y-3 pt-3 border-t border-slate-200/50 animate-in fade-in duration-200">
            
            {/* Show explicit start/end spans if multi-day */}
            {item.endDate && item.date !== item.endDate && (
              <div className="text-xs text-slate-600 flex flex-col gap-1.5 bg-white/40 p-2 rounded-lg">
                <div className="flex items-center gap-1.5"><Clock size={14} className="text-slate-400" /> <span className="font-semibold">Start:</span> {formatDate(item.date)} at {item.time}</div>
                <div className="flex items-center gap-1.5"><Clock size={14} className="text-slate-400" /> <span className="font-semibold">End:</span> {formatDate(item.endDate)} at {item.endTime || '11:00'}</div>
              </div>
            )}

            {/* Smart Location Rendering */}
            {item.category === 'transport' ? (
               <div className="flex flex-col gap-2 bg-white/50 p-3 rounded-lg text-sm border border-white/60">
                  <div className="flex items-start gap-2 text-slate-700">
                     <MapPin size={16} className="flex-shrink-0 mt-0.5 text-blue-500" />
                     <div><span className="font-bold text-slate-500 uppercase tracking-wider text-[10px] block">Departure</span> {item.location || 'Not specified'}</div>
                  </div>
                  {item.arrivalLocation && (
                     <div className="flex items-start gap-2 text-slate-700 mt-1 pt-2 border-t border-slate-200/50">
                        <MapPin size={16} className="flex-shrink-0 mt-0.5 text-emerald-500" />
                        <div><span className="font-bold text-slate-500 uppercase tracking-wider text-[10px] block">Arrival</span> {item.arrivalLocation}</div>
                     </div>
                  )}
               </div>
            ) : item.location ? (
              <div className="mt-1">
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.location)}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="inline-flex items-start gap-1.5 text-sm text-blue-600 hover:text-blue-800 transition-colors group/link">
                  <MapPin size={14} className="mt-0.5 flex-shrink-0 text-blue-400" />
                  <span className="underline decoration-blue-200 group-hover/link:decoration-blue-400 underline-offset-2">{item.location}</span>
                </a>
              </div>
            ) : null}

            {/* URL Link */}
            {item.url && (
              <div className="mt-1">
                <a href={item.url.startsWith('http') ? item.url : `https://${item.url}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 transition-colors">
                  <LinkIcon size={14} className="text-slate-400" />
                  <span className="truncate max-w-[200px] underline decoration-slate-200 underline-offset-2">{item.url.replace(/^https?:\/\//, '')}</span>
                </a>
              </div>
            )}

            {/* Full Notes */}
            {item.notes && (
              <div className="text-sm text-slate-700 bg-white/50 p-3 rounded-lg whitespace-pre-wrap border border-white/60">
                {item.notes}
              </div>
            )}

            {/* Ticket / Attachment */}
            {item.attachmentUrl && (
              <div className="mt-2">
                <a href={item.attachmentUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 bg-blue-100 hover:bg-blue-200 px-3 py-2 rounded-lg transition-colors border border-blue-200">
                  <Paperclip size={14} /> 
                  <span className="truncate max-w-[180px]">{item.attachmentName || 'View Attachment'}</span>
                </a>
              </div>
            )}

            {/* Cost and Payment Status */}
            {item.cost > 0 && (
              <div className="flex items-center justify-between bg-white/60 p-3 rounded-lg border border-white/60 mt-2">
                <span className="text-sm font-black text-slate-700">{formatCurrency(item.cost, item.currency)}</span>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md ${item.isPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  {item.isPaid ? 'Paid' : 'Unpaid'}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AddItemForm({ onClose, onSave, defaultDate, minDate, maxDate, initialData, tripId, storage }) {
  const [category, setCategory] = useState(initialData?.category || 'transport');
  
  const [formData, setFormData] = useState({
    subType: initialData?.subType || 'flight', 
    title: initialData?.title || '', 
    date: initialData?.date || defaultDate || minDate, 
    time: initialData?.time || '10:00',
    endDate: initialData?.endDate || defaultDate || minDate, 
    endTime: initialData?.endTime || '', 
    identifier: initialData?.identifier || '', 
    operator: initialData?.operator || '',
    location: initialData?.location || '', 
    arrivalLocation: initialData?.arrivalLocation || '', 
    // New City/Country Fields with legacy data migration logic
    depCity: initialData?.depCity || (initialData?.category === 'transport' && initialData?.location ? initialData.location.split(',')[0].trim() : ''),
    depCountry: initialData?.depCountry || (initialData?.category === 'transport' && initialData?.location && initialData.location.includes(',') ? initialData.location.split(',')[1].trim() : ''),
    arrCity: initialData?.arrCity || (initialData?.category === 'transport' && initialData?.arrivalLocation ? initialData.arrivalLocation.split(',')[0].trim() : ''),
    arrCountry: initialData?.arrCountry || (initialData?.category === 'transport' && initialData?.arrivalLocation && initialData.arrivalLocation.includes(',') ? initialData.arrivalLocation.split(',')[1].trim() : ''),
    city: initialData?.city || '',
    country: initialData?.country || '',
    url: initialData?.url || '', 
    cost: initialData?.cost || '', 
    currency: initialData?.currency || 'AUD', 
    isPaid: initialData?.isPaid || false, 
    notes: initialData?.notes || '',
    attachmentUrl: initialData?.attachmentUrl || '', 
    attachmentName: initialData?.attachmentName || ''
  });

  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleCategoryChange = (newCat) => {
    setCategory(newCat);
    setFormData(prev => ({ ...prev, subType: Object.keys(SUB_TYPES[newCat])[0] }));
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev, 
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    let finalTitle = formData.title;
    let finalLocation = formData.location;
    let finalArrivalLocation = formData.arrivalLocation;

    // Auto-generate title and legacy location strings for transport
    if (category === 'transport') {
       finalTitle = `${formData.depCity || 'Unknown'} to ${formData.arrCity || 'Unknown'} ${SUB_TYPES.transport[formData.subType]?.label || 'Transport'}`;
       finalLocation = [formData.depCity, formData.depCountry].filter(Boolean).join(', ');
       finalArrivalLocation = [formData.arrCity, formData.arrCountry].filter(Boolean).join(', ');
    }

    if (!finalTitle || !formData.date) return;
    
    // Ensure if no end date provided, it naturally caps to its start date so multi-day logic works safely
    let safeEndDate = formData.endDate;
    if (category !== 'accommodation' && !safeEndDate) safeEndDate = formData.date;

    const itemToSave = { 
      ...formData, 
      title: finalTitle,
      location: finalLocation,
      arrivalLocation: finalArrivalLocation,
      category, 
      endDate: safeEndDate,
      cost: formData.cost ? parseFloat(formData.cost) : 0 
    };

    if (file && storage && tripId) {
      setIsUploading(true);
      const fileRef = ref(storage, `trips/${tripId}/attachments/${Date.now()}_${file.name}`);
      const uploadTask = uploadBytesResumable(fileRef, file);
      
      uploadTask.on('state_changed', 
        (snapshot) => {
          setUploadProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
        },
        (error) => {
          console.error("Upload error", error);
          setIsUploading(false);
          onSave(itemToSave); // Save anyway if upload fails
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          itemToSave.attachmentUrl = downloadURL;
          itemToSave.attachmentName = file.name;
          onSave(itemToSave);
        }
      );
    } else {
      onSave(itemToSave);
    }
  };

  return (
    <div className="absolute inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6 animate-in fade-in">
      <div className="bg-white w-full h-[95%] sm:h-auto sm:max-h-[95vh] sm:max-w-md sm:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col animate-in slide-in-from-bottom-8">
        
        <div className="flex justify-between items-center p-5 border-b border-slate-100">
          <h2 className="text-xl font-bold">{initialData ? 'Edit Itinerary Item' : 'Add to Itinerary'}</h2>
          <button type="button" onClick={onClose} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-600"><X size={20} /></button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
          <form id="add-item-form" onSubmit={handleSubmit} className="space-y-6">
            
            <div className="flex bg-slate-100 p-1.5 rounded-xl">
              {Object.entries(CATEGORIES).map(([key, config]) => (
                <button
                  key={key} type="button" onClick={() => handleCategoryChange(key)}
                  className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all ${category === key ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
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
              {/* Title is hidden for Transport since it auto-generates */}
              {category !== 'transport' && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                    {category === 'accommodation' ? 'Accommodation Name' : 'Activity Title'} <span className="text-red-500">*</span>
                  </label>
                  <input type="text" name="title" required value={formData.title} onChange={handleChange} placeholder={category === 'accommodation' ? "e.g. Le Meurice..." : "e.g. Louvre Museum..."} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                </div>
              )}

              {category === 'accommodation' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 text-xs font-bold text-slate-500 uppercase tracking-wider -mb-2 mt-2">City <span className="text-red-500">*</span> & Country <span className="text-red-500">*</span></div>
                  <div>
                    <input type="text" name="city" required value={formData.city} onChange={handleChange} placeholder="City" className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                  </div>
                  <div>
                    <input type="text" name="country" required value={formData.country} onChange={handleChange} placeholder="Country" className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                  </div>
                </div>
              )}
              
              {category === 'transport' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Airline / Operator</label>
                      <input type="text" name="operator" value={formData.operator} onChange={handleChange} placeholder="e.g. Qantas" className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Flight/Train No.</label>
                      <input type="text" name="identifier" value={formData.identifier} onChange={handleChange} placeholder="e.g. QF 123" className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                    <div className="col-span-2 text-xs font-bold text-blue-800 uppercase tracking-wider mb-1">Departure Location <span className="text-red-500">*</span></div>
                    <div>
                      <input type="text" name="depCity" required value={formData.depCity} onChange={handleChange} placeholder="City" className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                    </div>
                    <div>
                      <input type="text" name="depCountry" required value={formData.depCountry} onChange={handleChange} placeholder="Country" className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 bg-emerald-50/50 p-4 rounded-xl border border-emerald-100">
                    <div className="col-span-2 text-xs font-bold text-emerald-800 uppercase tracking-wider mb-1">Arrival Location <span className="text-red-500">*</span></div>
                    <div>
                      <input type="text" name="arrCity" required value={formData.arrCity} onChange={handleChange} placeholder="City" className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                    </div>
                    <div>
                      <input type="text" name="arrCountry" required value={formData.arrCountry} onChange={handleChange} placeholder="Country" className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                    </div>
                  </div>
                </>
              )}

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
                  <input type="date" name="endDate" required={category==='accommodation'} min={formData.date} max={maxDate} value={formData.endDate} onChange={handleChange} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-500 text-sm" />
                </div>
                <div>
                  <input type="time" name="endTime" required={category==='accommodation'} value={formData.endTime} onChange={handleChange} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-500 text-sm" />
                </div>
              </div>

              {category !== 'transport' && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Address / Exact Location</label>
                  <input type="text" name="location" value={formData.location} onChange={handleChange} placeholder="Full address..." className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                </div>
              )}
              
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Website URL (Optional)</label>
                <input type="url" name="url" value={formData.url} onChange={handleChange} placeholder="https://..." className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 space-y-4">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Cost (Optional)</label>
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
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Ticket / Document</label>
              {formData.attachmentUrl && !file ? (
                <div className="flex items-center justify-between bg-blue-50 p-3 rounded-xl border border-blue-100 text-sm mb-2">
                   <span className="font-semibold text-blue-800 flex items-center gap-2"><Paperclip size={14} /> {formData.attachmentName}</span>
                   <button type="button" onClick={() => setFormData(prev => ({...prev, attachmentUrl: '', attachmentName: ''}))} className="text-red-500 hover:text-red-700 text-xs font-bold">Remove</button>
                </div>
              ) : null}
              <div className="relative">
                <input type="file" onChange={(e) => setFile(e.target.files[0])} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 transition-colors border border-slate-200 rounded-xl" />
              </div>
            </div>

          </form>
        </div>

        <div className="p-5 border-t border-slate-100 bg-white sm:rounded-b-3xl">
          <button type="submit" form="add-item-form" disabled={isUploading} className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 disabled:bg-blue-400 transition-colors shadow-sm flex items-center justify-center gap-2">
            {isUploading ? (
               <>Uploading... {uploadProgress}%</>
            ) : (
               initialData ? 'Save Changes' : 'Save Item'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChecklistView({ trip, db, appId, onDelete }) {
  const [newItem, setNewItem] = useState('');
  const checklist = trip.checklist || [];

  const handleToggle = async (itemId, currentStatus) => {
    const updatedChecklist = checklist.map(item => 
      item.id === itemId ? { ...item, checked: !currentStatus } : item
    );
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'trips', trip.id), { checklist: updatedChecklist });
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if(!newItem.trim()) return;
    const newChecklist = [...checklist, { id: Date.now().toString(), text: newItem, checked: false }];
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'trips', trip.id), { checklist: newChecklist });
    setNewItem('');
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
                <button onClick={() => onDelete(item.id)} className="text-slate-300 hover:text-red-500 p-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={16} /></button>
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

function ShareModal({ trip, onClose }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(trip.id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="absolute inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in">
      <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-6 text-center">
         <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4"><Share2 size={32} /></div>
         <h2 className="text-xl font-bold mb-2">Share this Trip</h2>
         <p className="text-sm text-slate-500 mb-6">Give this code to friends so they can join, view, and edit the itinerary.</p>
         <div className="bg-slate-100 p-4 rounded-xl flex items-center justify-between mb-6 border border-slate-200">
            <code className="font-mono text-slate-800 font-bold tracking-wider">{trip.id}</code>
            <button onClick={handleCopy} className="text-sm font-bold text-blue-600 hover:text-blue-800 transition-colors uppercase tracking-wider">{copied ? 'Copied!' : 'Copy'}</button>
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
    <div className="absolute inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in">
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
    if (!auth) return setError("Firebase is not connected. Check your config.");
    setError(''); setLoading(true);
    try {
      if (isLogin) await signInWithEmailAndPassword(auth, email, password);
      else await createUserWithEmailAndPassword(auth, email, password);
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  const handleGoogleAuth = async () => {
    if (!auth) return setError("Firebase is not connected. Check your config.");
    setError('');
    const provider = new GoogleAuthProvider();
    try { await signInWithPopup(auth, provider); } catch (err) { setError(err.message); }
  };

  const handleGuestAuth = async () => {
    if (!auth) return setError("Firebase is not connected. Check your config.");
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