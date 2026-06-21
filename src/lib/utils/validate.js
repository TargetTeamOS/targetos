export function validateContact(form) {
  const errors = {}
  if (!form.first_name?.trim()) errors.first_name = 'First name is required'
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = 'Invalid email'
  return errors
}

export function validateDeal(form) {
  const errors = {}
  if (!form.addr?.trim()) errors.addr = 'Address is required'
  if (!form.agent_id) errors.agent_id = 'Agent is required'
  return errors
}

export function validateListing(form) {
  const errors = {}
  if (!form.addr?.trim()) errors.addr = 'Address is required'
  return errors
}

export function hasErrors(errors) {
  return Object.keys(errors).length > 0
}
