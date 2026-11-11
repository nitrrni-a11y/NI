import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { getJwtCookieOptions } from '../controllers/authController.js';

const protect = async (req, res, next) => {
  let token = req.cookies.jwt;

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.userId).select('-password');
      if (!req.user) {
        res.cookie('jwt', '', { ...getJwtCookieOptions(req), expires: new Date(0) });
        return res.status(401).json({ message: 'Not authorized, user not found' });
      }
      next();
    } catch (error) {
      console.error(error);
      res.cookie('jwt', '', { ...getJwtCookieOptions(req), expires: new Date(0) });
      res.status(401).json({ message: 'Not authorized, token failed' });
    }
  } else {
    res.status(401).json({ message: 'Not authorized, no token' });
  }
};

const optionalProtect = async (req, res, next) => {
  const token = req.cookies?.jwt;
  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = (await User.findById(decoded.userId).select('-password')) || null;
  } catch {
    req.user = null;
  }
  next();
};

const admin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: 'Not authorized as an admin' });
  }
};

export { protect, optionalProtect, admin };
