import requests
requests.post('http://localhost:3000/api/agent-status', json={'name':'Graham','status':'ACTIVE','currentTask':'Held cash; PLTR $148.35 above $148, IONQ $28.12 still below $30'})
print('posted status')
