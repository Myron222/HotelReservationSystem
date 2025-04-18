const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();

app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: false }));

app.use(session({
  secret: 'secret-key',
  resave: false,
  saveUninitialized: false
}));

// In-memory data (replace with DB in production)
let users = [
  { id: 1, username: 'admin', password: 'admin', role: 'admin', email: 'admin@example.com', specialRequest: '' }
];
let hotels = [
  { id: 1, name: 'Ocean View Hotel', image: '/images/hotel1.jpg', description: 'Beautiful ocean view.' },
  { id: 2, name: 'Mountain Inn', image: '/images/hotel2.jpg', description: 'Cozy mountain retreat.' },
  { id: 3, name: 'City Lights Hotel', image: '/images/hotel3.jpg', description: 'In the heart of the city.' }
];
let rooms = [
  { id: 1, hotelId: 1, name: 'Single Room', price: 50 },
  { id: 2, hotelId: 1, name: 'Double Room', price: 80 },
  { id: 3, hotelId: 2, name: 'Suite', price: 120 },
  { id: 4, hotelId: 3, name: 'Deluxe', price: 150 }
];
let bookings = [];

// Middleware to expose user info to views
app.use((req, res, next) => {
  res.locals.user = req.session.user;
  res.locals.isAdmin = req.session.user && req.session.user.role === 'admin';
  next();
});

// Home page - show some hotels
app.get('/', (req, res) => {
  res.render('index', { hotels: hotels.slice(0, 3) });
});

// Register
app.get('/register', (req, res) => {
  res.render('register', { error: null });
});

app.post('/register', (req, res) => {
  const { username, password, email, specialRequest } = req.body;
  if (!username || !password || !email) {
    return res.render('register', { error: 'Please fill in all fields' });
  }
  if (users.find(u => u.username === username)) {
    return res.render('register', { error: 'Username already exists' });
  }
  const newUser = { id: users.length + 1, username, password, role: 'user', email: email, specialRequest: specialRequest };
  users.push(newUser);
  res.redirect('/login');
});

// Login
app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username && u.password === password);
  if (!user) {
    return res.render('login', { error: 'Invalid username or password' });
  }
  req.session.user = user;
  res.redirect('/hotels');
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// Hotels list (user must be logged in)
app.get('/hotels', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  res.render('hotels', { hotels });
});

// Hotel details + select dates to see available rooms
app.get('/hotels/:id', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  const hotel = hotels.find(h => h.id == req.params.id);
  if (!hotel) return res.status(404).send('Hotel not found');
  res.render('hotel_detail', { hotel, availableRooms: null, dates: null, error: null });
});

app.post('/hotels/:id', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  const hotel = hotels.find(h => h.id == req.params.id);
  if (!hotel) return res.status(404).send('Hotel not found');

  const { checkin, checkout } = req.body;
  if (!checkin || !checkout || new Date(checkin) >= new Date(checkout)) {
    return res.render('hotel_detail', {
      hotel,
      availableRooms: null,
      dates: null,
      error: 'Please select valid check-in and check-out dates.'
    });
  }

  // Find rooms for this hotel
  const hotelRooms = rooms.filter(r => r.hotelId == hotel.id);

  // Find booked rooms that overlap with requested dates
  const bookedRoomIds = bookings
    .filter(b => b.hotelId == hotel.id &&
      !(new Date(b.checkout) <= new Date(checkin) || new Date(b.checkin) >= new Date(checkout))
    )
    .map(b => b.roomId);

  // Rooms not booked in that date range
  const availableRooms = hotelRooms.filter(r => !bookedRoomIds.includes(r.id));

  res.render('hotel_detail', { hotel, availableRooms, dates: { checkin, checkout }, error: null });
});

// Booking confirmation page
app.post('/book/:roomId', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  const { checkin, checkout } = req.body;
  const room = rooms.find(r => r.id == req.params.roomId);
  if (!room) return res.status(404).send('Room not found');

  // Double-check availability before booking
  const overlappingBooking = bookings.find(b =>
    b.roomId === room.id &&
    !(new Date(b.checkout) <= new Date(checkin) || new Date(b.checkin) >= new Date(checkout))
  );
  if (overlappingBooking) {
    return res.send('Sorry, this room is already booked for the selected dates.');
  }

  bookings.push({
    id: bookings.length + 1,
    userId: req.session.user.id,
    hotelId: room.hotelId,
    roomId: room.id,
    checkin,
    checkout
  });

  res.render('booking_confirm', { room, checkin, checkout });
});

// User's bookings page
app.get('/my-bookings', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  const userBookings = bookings.filter(b => b.userId == req.session.user.id)
    .map(b => ({
      ...b,
      room: rooms.find(r => r.id == b.roomId),
      hotel: hotels.find(h => h.id == b.hotelId)
    }));
  res.render('my_bookings', { bookings: userBookings });
});

// Admin dashboard
app.get('/admin', (req, res) => {
  if (!res.locals.isAdmin) return res.redirect('/');
  res.render('admin_dashboard', { hotels, rooms });
});

// Admin: Add hotel form
app.get('/admin/hotels/new', (req, res) => {
  if (!res.locals.isAdmin) return res.redirect('/');
  res.render('admin_hotels', { hotel: null, error: null });
});

// Admin: Create hotel
app.post('/admin/hotels/new', (req, res) => {
  if (!res.locals.isAdmin) return res.redirect('/');
  const { name, image, description } = req.body;
  if (!name || !image) {
    return res.render('admin_hotels', { hotel: null, error: 'Name and Image URL required' });
  }
  const newHotel = {
    id: hotels.length + 1,
    name,
    image,
    description
  };
  hotels.push(newHotel);
  res.redirect('/admin');
});

// Admin: Edit hotel form
app.get('/admin/hotels/edit/:id', (req, res) => {
  if (!res.locals.isAdmin) return res.redirect('/');
  const hotel = hotels.find(h => h.id == req.params.id);
  if (!hotel) return res.redirect('/admin');
  res.render('admin_hotels', { hotel, error: null });
});

// Admin: Update hotel
app.post('/admin/hotels/edit/:id', (req, res) => {
  if (!res.locals.isAdmin) return res.redirect('/');
  const hotel = hotels.find(h => h.id == req.params.id);
  if (!hotel) return res.redirect('/admin');
  const { name, image, description } = req.body;
  if (!name || !image) {
    return res.render('admin_hotels', { hotel: null, error: 'Name and Image URL required' });
  }
  hotel.name = name;
  hotel.image = image;
  hotel.description = description;
  res.redirect('/admin');
});

// Admin: Add room form
app.get('/admin/rooms/new', (req, res) => {
  if (!res.locals.isAdmin) return res.redirect('/');
  res.render('admin_rooms', { room: null, hotels, error: null });
});

// Admin: Create room
app.post('/admin/rooms/new', (req, res) => {
  if (!res.locals.isAdmin) return res.redirect('/');
  const { hotelId, name, price } = req.body;
  if (!hotelId || !name || !price) {
    return res.render('admin_rooms', { room: null, hotels, error: 'All fields required' });
  }
  rooms.push({
    id: rooms.length + 1,
    hotelId: parseInt(hotelId),
    name,
    price: parseFloat(price)
  });
  res.redirect('/admin');
});

// Admin: Edit room form
app.get('/admin/rooms/edit/:id', (req, res) => {
  if (!res.locals.isAdmin) return res.redirect('/');
  const room = rooms.find(r => r.id == req.params.id);
  if (!room) return res.redirect('/admin');
  res.render('admin_rooms', { room, hotels, error: null });
});

// Admin: Update room
app.post('/admin/rooms/edit/:id', (req, res) => {
  if (!res.locals.isAdmin) return res.redirect('/');
  const room = rooms.find(r => r.id == req.params.id);
  if (!room) return res.redirect('/admin');
  const { hotelId, name, price } = req.body;
  if (!hotelId || !name || !price) {
    return res.render('admin_rooms', { room: null, hotels, error: 'All fields required' });
  }
  room.hotelId = parseInt(hotelId);
  room.name = name;
  room.price = parseFloat(price);
  res.redirect('/admin');
});

// Admin view available rooms for a hotel
app.get('/admin/hotel/:hotelId/rooms', (req, res) => {
  if (!res.locals.isAdmin) return res.redirect('/');

  const hotelId = parseInt(req.params.hotelId);
  const hotel = hotels.find(h => h.id === hotelId);

  if (!hotel) {
    return res.status(404).send('Hotel not found');
  }

  // Fetch all rooms for this hotel
  const hotelRooms = rooms.filter(r => r.hotelId === hotelId);

  // Fetch all bookings for this hotel
  const bookedRoomIds = bookings
    .filter(b => b.hotelId === hotelId)
    .map(b => b.roomId);

  // Determine which rooms are available
  const availableRooms = hotelRooms.filter(r => !bookedRoomIds.includes(r.id));

  res.render('admin_available_rooms', { hotel: hotel, availableRooms: availableRooms });
});

// Start server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
