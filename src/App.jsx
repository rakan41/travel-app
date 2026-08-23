import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, getDoc } from 'firebase/firestore';
import { 
  Calendar as CalendarIcon, List, Wallet, Plus, Plane, Bed, MapPin, 
  Train, Car, Bus, Ship, Navigation, Building, Home, Users, Trash2, 
  X, ChevronLeft, ChevronRight, Clock, Globe2, CalendarDays, ExternalLink, 
  Link as LinkIcon, Share2, UserPlus, AlertCircle, Sparkles, Bot, Send, Loader2, Wand2
} from 'lucide-react';

// --- Firebase Initialization ---
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
let app, auth, db;
try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (e) {
  console.error("Firebase init error:", e);
}
const appId = typeof __app_id !== 'undefined' ? __app_id : 'travel-app-id';

// --- Helper Functions ---
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

// --- Configuration & Icons ---
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

const currencies = ['USD', 'EUR', 'GBP', 'AUD', 'CAD', 'JPY'];

// --- Main Application ---
export default function App() {
  const [user, setUser] = useState(null);
  const [trips, setTrips] = useState([]);
  const [activeTripId, setActiveTripId] = useState(null); 
  
  const [activeTab, setActiveTab] = useState('calendar'); 
  const [selectedDate, setSelectedDate] = useState('');
  
  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAddTripModalOpen, setIsAddTripModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [isAIAssistantOpen, setIsAIAssistantOpen] = useState(false);

  // --- Auth & Data Fetching ---
  useEffect(() => {
    if (!auth) return;
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) { console.error(err); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

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

  // --- Derived State ---
  const activeTrip = trips.find(t => t.id === activeTripId);

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

  const itemsForSelectedDate = useMemo(() => {
    if (!activeTrip) return [];
    return activeTrip.items
      .filter(item => item.date === selectedDate)
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [activeTrip, selectedDate]);

  // --- Location Inference Engine ---
  const locationData = useMemo(() => {
    if (!activeTrip) return { startOfDays: {}, itemArrivals: {} };
    
    const allItems = [...activeTrip.items].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.time.localeCompare(b.time);
    });

    let currentLocation = 'Origin'; 
    const startOfDays = {};
    const itemArrivals = {}; 

    allItems.forEach(item => {
      if (!startOfDays[item.date]) {
        startOfDays[item.date] = currentLocation;
      }
      if (item.category === 'transport' && item.arrivalLocation) {
        currentLocation = item.arrivalLocation;
        itemArrivals[item.id] = currentLocation;
      }
    });

    return { startOfDays, itemArrivals };
  }, [activeTrip]);

  // --- Handlers ---
  const handleCreateTrip = async (newTrip) => {
    if (!user) return;
    const trip = { 
      ...newTrip, 
      ownerId: user.uid,
      sharedWith: [],
      items: [] 
    };
    const newTripRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'trips'));
    await setDoc(newTripRef, trip);
    setIsAddTripModalOpen(false);
  };

  const handleDeleteTrip = async (id, e) => {
    e.stopPropagation();
    if (window.confirm("Are you sure you want to delete this trip entirely? This affects everyone sharing it.")) {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'trips', id));
      if (activeTripId === id) setActiveTripId(null);
    }
  };

  const handleJoinTrip = async (tripIdToJoin) => {
    if (!user) return { success: false, message: "Not logged in" };
    try {
      const tripRef = doc(db, 'artifacts', appId, 'public', 'data', 'trips', tripIdToJoin);
      const snap = await getDoc(tripRef);
      if (snap.exists()) {
        const data = snap.data();
        if (data.ownerId === user.uid || data.sharedWith.includes(user.uid)) {
          return { success: true, message: "You already have access to this trip." };
        }
        await updateDoc(tripRef, { sharedWith: [...data.sharedWith, user.uid] });
        return { success: true, message: "Successfully joined trip!" };
      } else {
        return { success: false, message: "Trip not found. Check the ID." };
      }
    } catch (e) {
      return { success: false, message: "Error joining trip." };
    }
  };

  const openTrip = (trip) => {
    setActiveTripId(trip.id);
    setSelectedDate(trip.startDate);
    setActiveTab('calendar');
  };

  const handleAddItem = async (newItem) => {
    if (!activeTrip) return;
    const newItems = [...activeTrip.items, { ...newItem, id: Date.now().toString() }];
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'trips', activeTripId), { items: newItems });
    setIsAddModalOpen(false);
    setSelectedDate(newItem.date);
    setActiveTab('day');
  };

  const handleDeleteItem = async (itemId) => {
    if (window.confirm("Are you sure you want to delete this item?")) {
      const newItems = activeTrip.items.filter(item => item.id !== itemId);
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'trips', activeTripId), { items: newItems });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex justify-center font-sans text-slate-800">
      <div className="w-full max-w-md bg-white shadow-xl flex flex-col relative overflow-hidden">
        
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
              <button onClick={() => setIsJoinModalOpen(true)} className="flex items-center gap-1 text-xs font-semibold bg-slate-800 px-3 py-1.5 rounded-full hover:bg-slate-700 transition-colors">
                <UserPlus size={14} /> Join
              </button>
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
              <div className="flex items-center gap-2">
                <button onClick={() => setIsAIAssistantOpen(true)} className="p-2 bg-purple-600/20 text-purple-400 hover:bg-purple-600/40 rounded-full transition-colors" title="AI Trip Assistant">
                  <Bot size={18} />
                </button>
                <button onClick={() => setIsShareModalOpen(true)} className="p-2 bg-blue-600/20 text-blue-400 hover:bg-blue-600/40 rounded-full transition-colors" title="Share Trip">
                  <Share2 size={18} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto pb-24 relative">
          
          {/* Dashboard */}
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
                  <div key={trip.id} onClick={() => openTrip(trip)} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all cursor-pointer group relative">
                    <button onClick={(e) => handleDeleteTrip(trip.id, e)} className="absolute top-4 right-4 text-slate-300 hover:text-red-500 transition-colors opacity-100 sm:opacity-0 group-hover:opacity-100">
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

          {/* Individual Trip Views */}
          {activeTrip && (
            <>
              {activeTab === 'calendar' && (
                <CalendarView trip={activeTrip} onSelectDate={(date) => { setSelectedDate(date); setActiveTab('day'); }} />
              )}
              {activeTab === 'day' && (
                <DayView 
                  date={selectedDate} 
                  items={itemsForSelectedDate} 
                  startLocation={locationData.startOfDays[selectedDate]}
                  arrivalLocations={locationData.itemArrivals}
                  onDelete={handleDeleteItem}
                  tripStart={activeTrip.startDate}
                  tripEnd={activeTrip.endDate}
                  onDateChange={setSelectedDate}
                />
              )}
              {activeTab === 'budget' && (
                <BudgetView summary={budgetSummary} items={activeTrip.items} />
              )}
            </>
          )}
        </div>

        {/* FAB */}
        <button 
          onClick={() => activeTrip ? setIsAddModalOpen(true) : setIsAddTripModalOpen(true)}
          className="absolute bottom-24 right-6 bg-blue-600 text-white p-4 rounded-full shadow-lg hover:bg-blue-700 hover:scale-105 active:scale-95 transition-all z-20"
        >
          <Plus size={24} />
        </button>

        {/* Bottom Nav */}
        {activeTrip && (
          <div className="absolute bottom-0 w-full bg-white border-t border-slate-200 px-6 py-4 flex justify-between items-center z-20 pb-safe animate-in slide-in-from-bottom-8">
            <NavButton icon={CalendarIcon} label="Calendar" isActive={activeTab === 'calendar'} onClick={() => setActiveTab('calendar')} />
            <NavButton icon={List} label="Itinerary" isActive={activeTab === 'day'} onClick={() => setActiveTab('day')} />
            <NavButton icon={Wallet} label="Budget" isActive={activeTab === 'budget'} onClick={() => setActiveTab('budget')} />
          </div>
        )}

        {/* Modals */}
        {isAddModalOpen && activeTrip && (
          <AddItemForm 
            onClose={() => setIsAddModalOpen(false)} 
            onSave={handleAddItem}
            defaultDate={selectedDate}
            minDate={activeTrip.startDate}
            maxDate={activeTrip.endDate}
          />
        )}
        {isAddTripModalOpen && <AddTripForm onClose={() => setIsAddTripModalOpen(false)} onSave={handleCreateTrip} />}
        {isShareModalOpen && activeTrip && <ShareModal trip={activeTrip} onClose={() => setIsShareModalOpen(false)} />}
        {isJoinModalOpen && <JoinTripModal onClose={() => setIsJoinModalOpen(false)} onJoin={handleJoinTrip} />}
        {isAIAssistantOpen && activeTrip && <AIAssistantModal trip={activeTrip} onClose={() => setIsAIAssistantOpen(false)} />}
      </div>
    </div>
  );
}

// --- Subcomponents ---

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

function DayView({ date, items, startLocation, arrivalLocations, onDelete, tripStart, tripEnd, onDateChange }) {
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
      <div className="bg-white sticky top-0 z-10 border-b border-slate-100 px-4 py-3 flex items-center justify-between shadow-sm">
        <button onClick={handlePrevDay} disabled={isFirstDay} className={`p-2 rounded-full ${isFirstDay ? 'text-slate-200' : 'text-slate-600 hover:bg-slate-100'}`}>
          <ChevronLeft size={20} />
        </button>
        <div className="text-center flex-1 mx-2">
          <h2 className="font-bold text-lg">{formatDate(date)}</h2>
          {startLocation && startLocation !== 'Origin' && (
            <div className="flex items-center justify-center gap-1 mt-0.5 text-xs font-medium text-slate-500 uppercase tracking-wider">
              <MapPin size={12} className="text-slate-400" /> {startLocation}
            </div>
          )}
        </div>
        <button onClick={handleNextDay} disabled={isLastDay} className={`p-2 rounded-full ${isLastDay ? 'text-slate-200' : 'text-slate-600 hover:bg-slate-100'}`}>
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="p-6 relative">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-16 text-center text-slate-400">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4"><CalendarIcon size={32} className="text-slate-300" /></div>
            <p className="font-medium text-slate-600">No plans yet for this day.</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="absolute left-9 top-10 bottom-10 w-0.5 bg-slate-200 -z-10"></div>
            
            {items.map((item) => {
              const catConfig = CATEGORIES[item.category] || CATEGORIES.activity;
              const subConfig = SUB_TYPES[item.category]?.[item.subType] || SUB_TYPES.activity.other;
              const TypeIcon = subConfig.icon;
              const mapUrl = item.location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.location)}` : null;

              return (
                <React.Fragment key={item.id}>
                  <div className="flex gap-4 group">
                    <div className="flex flex-col items-center">
                      <span className="text-xs font-bold text-slate-500 w-12 text-right pt-2">{item.time}</span>
                    </div>
                    
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${catConfig.bg} border-4 border-slate-50 shadow-sm relative z-10`}>
                      <TypeIcon size={18} className={catConfig.color} />
                    </div>
                    
                    <div className={`flex-1 bg-white border-l-4 ${catConfig.border} border-t border-r border-b border-slate-100 p-4 rounded-r-2xl rounded-tl-sm rounded-bl-sm shadow-sm relative transition-all hover:shadow-md`}>
                      <button onClick={() => onDelete(item.id)} className="absolute top-4 right-4 text-slate-300 hover:text-red-500 transition-colors opacity-100 sm:opacity-0 group-hover:opacity-100">
                        <Trash2 size={16} />
                      </button>

                      <div className="pr-6">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                          {subConfig.label} {item.identifier && `• ${item.identifier}`}
                        </span>
                        <h3 className="font-bold text-lg leading-tight mb-2">{item.title}</h3>
                        
                        <div className="text-sm text-slate-600 space-y-1 mb-3">
                          {item.category === 'transport' && (
                            <div className="flex flex-col gap-1">
                               <span className="flex items-center gap-1.5"><Clock size={14} className="text-slate-400" /> Departs: {item.time}</span>
                               {item.endTime && (
                                 <span className="flex items-center gap-1.5 ml-5 text-slate-500">
                                   ↳ Arrives: {item.endTime} {item.endDate && item.endDate !== item.date && `(${formatShortDate(item.endDate)})`}
                                 </span>
                               )}
                            </div>
                          )}
                          {item.category === 'accommodation' && (
                            <div className="flex items-center gap-1.5">
                              <Clock size={14} className="text-slate-400" />
                              <span>Check-in: {item.time}</span>
                              {item.endDate && (
                                <span className="text-slate-400">
                                  → Check-out: {item.endTime || '11:00'} ({formatShortDate(item.endDate)})
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {item.location && (
                          <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1.5 text-sm text-blue-600 hover:text-blue-800 transition-colors mt-2 group/link">
                            <MapPin size={14} className="mt-0.5 flex-shrink-0" />
                            <span className="underline decoration-blue-200 group-hover/link:decoration-blue-400 underline-offset-2">{item.location}</span>
                            <ExternalLink size={12} className="mt-0.5 opacity-50" />
                          </a>
                        )}

                        {item.url && (
                          <div className="mt-2">
                            <a href={item.url.startsWith('http') ? item.url : `https://${item.url}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors">
                              <LinkIcon size={14} />
                              <span className="truncate max-w-[200px]">{item.url.replace(/^https?:\/\//, '')}</span>
                            </a>
                          </div>
                        )}
                        
                        {item.notes && (
                          <p className="text-sm text-slate-600 mt-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
                            {item.notes}
                          </p>
                        )}
                      </div>
                      
                      {item.cost > 0 && (
                        <div className="mt-3 pt-3 border-t border-slate-50 flex items-center justify-end gap-2 text-[11px] font-medium text-slate-400">
                          <span>{formatCurrency(item.cost, item.currency)}</span>
                          <span>•</span>
                          <span className={item.isPaid ? 'text-emerald-600/70' : 'text-amber-600/70'}>{item.isPaid ? 'Paid' : 'Unpaid'}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Location Arrival Marker Logic */}
                  {arrivalLocations[item.id] && (
                    <div className="relative flex justify-center py-2 z-10 animate-in fade-in zoom-in duration-300">
                      <div className="bg-slate-800 text-white text-xs font-bold px-4 py-1.5 rounded-full flex items-center gap-1.5 shadow-md">
                         <MapPin size={12} className="text-blue-400" />
                         Arrived in {arrivalLocations[item.id]}
                      </div>
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

function BudgetView({ summary, items }) {
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
    document.execCommand('copy'); 
    navigator.clipboard.writeText(trip.id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="absolute inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in">
      <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-6 text-center">
         <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <Share2 size={32} />
         </div>
         <h2 className="text-xl font-bold mb-2">Share this Trip</h2>
         <p className="text-sm text-slate-500 mb-6">Give this code to friends so they can join, view, and edit the itinerary.</p>
         
         <div className="bg-slate-100 p-4 rounded-xl flex items-center justify-between mb-6 border border-slate-200">
            <code className="font-mono text-slate-800 font-bold tracking-wider">{trip.id}</code>
            <button onClick={handleCopy} className="text-sm font-bold text-blue-600 hover:text-blue-800 transition-colors uppercase tracking-wider">
              {copied ? 'Copied!' : 'Copy'}
            </button>
         </div>

         <button onClick={onClose} className="w-full bg-slate-800 text-white font-bold py-3 rounded-xl hover:bg-slate-900 transition-colors">
            Done
         </button>
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
    if (result.success) {
      onClose();
    } else {
      setError(result.message);
    }
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
           <input 
             type="text" autoFocus required value={tripId} onChange={e => setTripId(e.target.value)}
             placeholder="Paste code here..."
             className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-center font-mono tracking-wider"
           />
           
           {error && (
             <div className="mt-3 text-red-500 text-sm flex items-center justify-center gap-1.5 font-medium">
               <AlertCircle size={14} /> {error}
             </div>
           )}

           <button disabled={loading} type="submit" className="w-full mt-6 bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {loading ? 'Joining...' : 'Join Trip'}
           </button>
        </form>
      </div>
    </div>
  );
}

function AddTripForm({ onClose, onSave }) {
  const [formData, setFormData] = useState({ name: '', startDate: '', endDate: '' });

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
          <h2 className="text-xl font-bold">Plan a New Trip</h2>
          <button onClick={onClose} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-600"><X size={20} /></button>
        </div>
        <div className="p-6">
          <form id="add-trip-form" onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Trip Name</label>
              <input type="text" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. Summer in Tokyo" className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Start Date</label>
                <input type="date" required value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">End Date</label>
                <input type="date" required min={formData.startDate} value={formData.endDate} onChange={e => setFormData({...formData, endDate: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
              </div>
            </div>
          </form>
        </div>
        <div className="p-5 border-t border-slate-100 bg-white sm:rounded-b-3xl">
          <button type="submit" form="add-trip-form" className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 transition-colors shadow-sm">Create Trip</button>
        </div>
      </div>
    </div>
  );
}

function AddItemForm({ onClose, onSave, defaultDate, minDate, maxDate }) {
  const [category, setCategory] = useState('transport');
  const [isMagicMode, setIsMagicMode] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  
  const [formData, setFormData] = useState({
    subType: 'flight',
    title: '',
    date: defaultDate || minDate,
    time: '10:00',
    endDate: defaultDate || minDate,
    endTime: '',
    identifier: '',
    location: '',
    arrivalLocation: '',
    url: '',
    cost: '',
    currency: 'USD',
    isPaid: false,
    notes: ''
  });

  const handleCategoryChange = (newCat) => {
    setCategory(newCat);
    setFormData(prev => ({ ...prev, subType: Object.keys(SUB_TYPES[newCat])[0] }));
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.title || !formData.date) return;
    const itemToSave = {
      ...formData,
      category,
      cost: formData.cost ? parseFloat(formData.cost) : 0
    };
    onSave(itemToSave);
  };

  const handleMagicExtract = async () => {
    if (!pasteText.trim()) return;
    setIsExtracting(true);
    try {
      const apiKey = "";
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;
      
      const payload = {
        contents: [{ parts: [{ text: `Extract itinerary item details from the following text. Default to the closest matching category and subType. If you cannot determine dates, use ${defaultDate || minDate}. \n\nText to extract:\n${pasteText}` }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              category: { type: "STRING", enum: ["transport", "accommodation", "activity"], description: "Primary category" },
              subType: { type: "STRING", description: "Such as flight, train, hotel, dining, tour, etc." },
              title: { type: "STRING", description: "A concise title" },
              date: { type: "STRING", description: "Start date in YYYY-MM-DD format" },
              time: { type: "STRING", description: "Start time in HH:MM format" },
              endDate: { type: "STRING", description: "End date in YYYY-MM-DD format" },
              endTime: { type: "STRING", description: "End time in HH:MM format" },
              location: { type: "STRING", description: "Departure or primary location/address" },
              arrivalLocation: { type: "STRING", description: "For transport, the arrival location/city" },
              cost: { type: "NUMBER" },
              currency: { type: "STRING", description: "e.g., USD, EUR" },
              identifier: { type: "STRING", description: "e.g., Flight number AF123" },
              notes: { type: "STRING", description: "Important booking references or context" }
            },
            required: ["category", "subType", "title", "date", "time"]
          }
        }
      };

      const response = await fetch(apiUrl, { method: 'POST', body: JSON.stringify(payload) });
      const data = await response.json();
      const jsonStr = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (jsonStr) {
        const parsed = JSON.parse(jsonStr);
        setCategory(parsed.category || 'transport');
        setFormData(prev => ({
          ...prev,
          ...parsed,
          isPaid: true
        }));
        setIsMagicMode(false);
      }
    } catch (e) {
      console.error("Failed to extract details", e);
      alert("Failed to extract details. Please try manually.");
    }
    setIsExtracting(false);
  };

  return (
    <div className="absolute inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6 animate-in fade-in">
      <div className="bg-white w-full h-[95%] sm:h-auto sm:max-h-[95vh] sm:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col animate-in slide-in-from-bottom-8">
        
        <div className="flex justify-between items-center p-5 border-b border-slate-100">
          <h2 className="text-xl font-bold flex items-center gap-2">
            Add to Itinerary
            <button 
              onClick={() => setIsMagicMode(!isMagicMode)}
              className={`ml-2 text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1 transition-colors ${isMagicMode ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
            >
              <Sparkles size={12} /> Magic Extract
            </button>
          </h2>
          <button type="button" onClick={onClose} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-600"><X size={20} /></button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
          {isMagicMode ? (
            <div className="space-y-4 animate-in fade-in">
              <div className="bg-purple-50 p-4 rounded-xl border border-purple-100 text-sm text-purple-800">
                <p className="font-semibold mb-1 flex items-center gap-1.5"><Wand2 size={16} /> Paste your booking details</p>
                <p className="opacity-80">Paste a flight confirmation email, hotel booking, or text message, and our AI will extract the details for you.</p>
              </div>
              <textarea 
                autoFocus
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Paste email or text here..."
                className="w-full h-48 px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 resize-none text-sm"
              />
              <button 
                onClick={handleMagicExtract}
                disabled={isExtracting || !pasteText.trim()}
                className="w-full bg-purple-600 text-white font-bold py-3 rounded-xl hover:bg-purple-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {isExtracting ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                {isExtracting ? 'Extracting details...' : 'Extract Details'}
              </button>
            </div>
          ) : (
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
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                    {category === 'transport' ? 'Route / Title' : (category === 'accommodation' ? 'Accommodation Name' : 'Activity Title')}
                  </label>
                  <input type="text" name="title" required value={formData.title} onChange={handleChange} placeholder="e.g. Flight to Paris, Le Meurice..." className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                </div>
                
                {category === 'transport' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Flight/Train Number (Optional)</label>
                    <input type="text" name="identifier" value={formData.identifier} onChange={handleChange} placeholder="e.g. AF 007" className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <div className="col-span-2">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                       {category === 'transport' ? 'Departure' : (category === 'accommodation' ? 'Check-in' : 'Start')}
                    </span>
                  </div>
                  <div>
                    <input type="date" name="date" required min={minDate} max={maxDate} value={formData.date} onChange={handleChange} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-500 text-sm" />
                  </div>
                  <div>
                    <input type="time" name="time" required value={formData.time} onChange={handleChange} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-500 text-sm" />
                  </div>

                  {category !== 'activity' && (
                    <>
                      <div className="col-span-2 mt-2 border-t border-slate-200 pt-3">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                           {category === 'transport' ? 'Arrival (Optional)' : 'Check-out'}
                        </span>
                      </div>
                      <div>
                        <input type="date" name="endDate" required={category==='accommodation'} min={formData.date} max={maxDate} value={formData.endDate} onChange={handleChange} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-500 text-sm" />
                      </div>
                      <div>
                        <input type="time" name="endTime" required={category==='accommodation'} value={formData.endTime} onChange={handleChange} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-500 text-sm" />
                      </div>
                    </>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                    {category === 'transport' ? 'Departure Address / Location' : 'Address / Location'}
                  </label>
                  <input type="text" name="location" value={formData.location} onChange={handleChange} placeholder="Full address for Google Maps..." className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                </div>

                {category === 'transport' && (
                  <div className="flex bg-slate-100 p-1.5 rounded-xl flex-col gap-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider px-2 pt-1">Arrival City/Location</label>
                    <input type="text" name="arrivalLocation" value={formData.arrivalLocation} onChange={handleChange} placeholder="e.g. Paris, France" className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                    <p className="text-xs text-slate-400 px-2 pb-1">This will update your daily location on the itinerary.</p>
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
                    <select name="currency" value={formData.currency} onChange={handleChange} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 appearance-none font-medium">
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
                <textarea name="notes" rows="2" value={formData.notes} onChange={handleChange} placeholder="Booking refs, terminal info..." className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"></textarea>
              </div>

            </form>
          )}
        </div>

        <div className="p-5 border-t border-slate-100 bg-white sm:rounded-b-3xl">
          {!isMagicMode && (
            <button type="submit" form="add-item-form" className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 transition-colors shadow-sm">
              Save Item
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function AIAssistantModal({ trip, onClose }) {
  const [messages, setMessages] = useState([
    { role: 'model', text: `Hi! I'm your AI Travel Assistant for your trip to ${trip.name}. Ask me for recommendations, packing lists, or questions about your itinerary!` }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    
    const userText = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userText }]);
    setIsLoading(true);

    try {
      const apiKey = "";
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;
      
      const chatHistory = messages.map(msg => ({
        role: msg.role === 'model' ? 'model' : 'user',
        parts: [{ text: msg.text }]
      }));
      chatHistory.push({ role: 'user', parts: [{ text: userText }] });

      const payload = {
        contents: chatHistory,
        systemInstruction: {
          parts: [{ 
            text: `You are a helpful and enthusiastic AI Travel Assistant built into a travel itinerary app. 
            You are helping the user with their specific trip:
            Trip Name: ${trip.name}
            Dates: ${trip.startDate} to ${trip.endDate}
            Current Itinerary Items: ${JSON.stringify(trip.items.map(i => ({title: i.title, date: i.date, time: i.time, location: i.location})))}
            
            Keep your answers concise, friendly, and directly relevant to their trip. Formulate recommendations based on their existing schedule.` 
          }]
        }
      };

      const response = await fetch(apiUrl, { method: 'POST', body: JSON.stringify(payload) });
      const data = await response.json();
      const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I'm having trouble thinking right now.";
      
      setMessages(prev => [...prev, { role: 'model', text: replyText }]);
    } catch (error) {
      console.error("AI Assistant Error:", error);
      setMessages(prev => [...prev, { role: 'model', text: "Sorry, I couldn't connect to the AI service. Please try again later." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="absolute inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6 animate-in fade-in">
      <div className="bg-white w-full h-[90%] sm:h-auto sm:max-h-[85vh] sm:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col animate-in slide-in-from-bottom-8">
        
        <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-purple-50 sm:rounded-t-3xl rounded-t-3xl">
          <h2 className="text-xl font-bold flex items-center gap-2 text-purple-900">
            <Bot size={24} className="text-purple-600" /> Trip Assistant
          </h2>
          <button onClick={onClose} className="p-2 bg-white/50 hover:bg-white/80 rounded-full text-purple-900 transition-colors"><X size={20} /></button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar space-y-4 bg-slate-50">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${msg.role === 'user' ? 'bg-purple-600 text-white rounded-br-sm' : 'bg-white border border-slate-100 text-slate-700 rounded-bl-sm'}`}>
                {msg.text}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white border border-slate-100 rounded-2xl rounded-bl-sm px-4 py-3 text-sm shadow-sm text-slate-500 flex items-center gap-2">
                <Loader2 size={16} className="animate-spin text-purple-500" /> Thinking...
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 bg-white sm:rounded-b-3xl">
          <form onSubmit={handleSend} className="relative flex items-center">
            <input 
              type="text" 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask for recommendations, packing tips..."
              className="w-full pl-4 pr-12 py-3.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-sm"
            />
            <button 
              type="submit" 
              disabled={!input.trim() || isLoading}
              className="absolute right-2 p-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}